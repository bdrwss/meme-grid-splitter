/**
 * 云函数 api：PRD《登录鉴权与学员库管理》统一入口（action 路由）。
 *
 * 架构（对照 PRD）：
 * - 静默鉴权：wx-server-sdk 的 getWXContext().OPENID 由微信侧注入，前端不传身份、
 *   无需 code2Session/AppSecret，天然防伪造（PRD 一.1）。
 * - 单表多视图：全网仅 student_pool 一张学员总表；教师查询强制 teacher_uid=自己，
 *   管理员可查全量（PRD 一.2）。
 * - 管理员口令只在云函数侧比对（可经 config/admin.adminPin 覆盖，默认 666），
 *   前端包内无明文口令（PRD 五.1 安全要求）。
 *
 * 集合：users / student_pool / auth_codes / config（由 initDb 创建）。
 */

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const DEFAULT_ADMIN_PIN = "666";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉 0/O/1/I 等易混淆字符
const PAGE_SIZE = 20;
const MAX_IMPORT = 300; // 单次批量导入上限

function ok(data) {
  return { ok: true, data: data || {} };
}
function fail(reason) {
  return { ok: false, reason };
}
function now() {
  return new Date();
}
function cleanUid(v) {
  return String(v == null ? "" : v).trim();
}
function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function genCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/* ---------------- 身份与守卫 ---------------- */

async function getAdminPin() {
  try {
    const r = await db.collection("config").doc("admin").get();
    return (r.data && r.data.adminPin) || DEFAULT_ADMIN_PIN;
  } catch (e) {
    return DEFAULT_ADMIN_PIN;
  }
}

async function getUser(openid) {
  if (!openid) return null;
  const r = await db.collection("users").where({ wx_openid: openid }).limit(1).get();
  return r.data[0] || null;
}

function requireTeacher(u) {
  if (!u || u.role !== "teacher") throw { biz: "需要教师身份，请先在「我的」页绑定教师" };
  if (u.user_status === 2) throw { biz: "该教师账号已被禁用" };
}

function requireAdmin(u) {
  if (!u || u.role !== "admin") throw { biz: "需要管理员身份" };
}

/* ---------------- 登录（PRD 三.1：状态自检 + 黑名单拦截） ---------------- */

async function doLogin(openid) {
  if (!openid) return { state: "guest" };
  const u = await getUser(openid);
  // 情况 A：封禁全屏拦截
  if (u && u.user_status === 2) return { state: "banned" };
  if (u && u.role === "teacher") {
    return {
      state: "teacher",
      uid: u.xibo_uid,
      name: u.name || "",
      avatarUrl: u.avatarUrl || "",
      className: u.className || "",
      age: u.age || "",
    };
  }
  if (u && u.role === "admin") {
    return {
      state: "admin",
      name: u.name || "超级管理员",
      avatarUrl: u.avatarUrl || "",
    };
  }
  if (u && u.role === "student") {
    const pr = await db.collection("student_pool").where({ student_uid: u.xibo_uid }).limit(1).get();
    const pool = pr.data[0];
    if (!pool || pool.bound_openid !== openid) return { state: "guest" }; // 记录已被解绑/漂移
    if (pool.status === 2) return { state: "banned" };
    // 情况 B：正常已绑定，直接返回角色，无需再次登录
    return {
      state: "student",
      uid: pool.student_uid,
      batchNo: pool.batch_no || "",
      teacherUid: pool.teacher_uid || "",
      name: u.name || pool.student_name || "",
      avatarUrl: u.avatarUrl || "",
      className: u.className || pool.batch_no || "",
      age: u.age || "",
    };
  }
  // 兜底：users 行缺失时按学员总表识别（绑定成功即建行，正常不会走到这里）
  const pr2 = await db.collection("student_pool").where({ bound_openid: openid }).limit(1).get();
  const p2 = pr2.data[0];
  if (p2) {
    if (p2.status === 2) return { state: "banned" };
    if (p2.status === 1) {
      try {
        await db.collection("users").add({
          data: { wx_openid: openid, role: "student", xibo_uid: p2.student_uid, auth_code: "", user_status: 1, create_time: now() },
        });
      } catch (e) { /* 并发下可能已存在，忽略 */ }
      return {
        state: "student",
        uid: p2.student_uid,
        batchNo: p2.batch_no || "",
        teacherUid: p2.teacher_uid || "",
        name: p2.student_name || "",
        avatarUrl: "",
        className: p2.batch_no || "",
        age: "",
      };
    }
  }
  // 情况 C：未注册新用户
  return { state: "guest" };
}

/* ---------------- 学员绑定（PRD 三.2 分支A） ---------------- */

async function bindStudent(openid, studentUid) {
  if (!openid) return fail("无法获取微信身份");
  const uid = cleanUid(studentUid);
  if (!uid) return fail("请输入学员 UID");
  const pr = await db.collection("student_pool").where({ student_uid: uid }).limit(1).get();
  const pool = pr.data[0];
  if (!pool) return fail("未查询到您的学员 UID，请联系带班老师录入");
  if (pool.status === 2) return fail("该 UID 已被管理员禁用");
  if (pool.bound_openid && pool.bound_openid !== openid) {
    return fail("该 UID 已被其他微信绑定，如需换绑请联系带班老师解绑");
  }
  if (pool.bound_openid !== openid) {
    // 条件更新防并发抢占：仅当 bound_openid 仍为读取到的旧值时写入
    const upd = await db.collection("student_pool")
      .where({ student_uid: uid, bound_openid: pool.bound_openid || "" })
      .update({ data: { bound_openid: openid, status: 1, update_time: now() } });
    if (!upd.stats || upd.stats.updated !== 1) {
      return fail("该 UID 已被其他微信绑定，如需换绑请联系带班老师解绑");
    }
  } else {
    await db.collection("student_pool").doc(pool._id).update({ data: { status: 1, update_time: now() } });
  }
  const ex = await getUser(openid);
  if (ex && (ex.role === "teacher" || ex.role === "admin")) {
    return fail("当前微信已绑定教师或管理员身份，如需更改请联系管理员");
  }
  if (!ex) {
    await db.collection("users").add({
      data: { wx_openid: openid, role: "student", xibo_uid: uid, auth_code: "", user_status: 1, create_time: now() },
    });
  } else {
    await db.collection("users").doc(ex._id).update({ data: { role: "student", xibo_uid: uid, user_status: 1 } });
  }
  return ok({ state: "student", uid, batchNo: pool.batch_no || "", teacherUid: pool.teacher_uid || "" });
}

/* ---------------- 教师注册（PRD 三.2 分支B：UID + 授权码，一码一微信死绑） ---------------- */

async function bindTeacher(openid, teacherUid, authCode) {
  if (!openid) return fail("无法获取微信身份");
  const uid = cleanUid(teacherUid);
  const code = cleanUid(authCode).toUpperCase();
  if (!uid || !code) return fail("请输入教师 UID 与授权码");
  const cr = await db.collection("auth_codes").where({ code }).limit(1).get();
  const c = cr.data[0];
  if (!c || c.status !== 0) return fail("授权码无效或已被使用");
  const dupe = await db.collection("users").where({ role: "teacher", xibo_uid: uid, wx_openid: _.neq(openid) }).count();
  if (dupe.total > 0) return fail("该教师 UID 已被其他微信绑定");
  // 条件消耗授权码（防同一码并发复用），并记录使用时间供管理员追踪
  const upd = await db.collection("auth_codes")
    .where({ code, status: 0 })
    .update({ data: { status: 1, used_by_uid: uid, used_by_openid: openid, used_time: now() } });
  if (!upd.stats || upd.stats.updated !== 1) return fail("授权码无效或已被使用");
  const ex = await getUser(openid);
  if (ex && ex.role === "admin") return fail("管理员微信请使用管理员身份，教师注册请更换微信");
  const data = { role: "teacher", xibo_uid: uid, auth_code: code, user_status: 1 };
  if (!ex) {
    await db.collection("users").add({ data: Object.assign({ wx_openid: openid, create_time: now() }, data) });
  } else {
    await db.collection("users").doc(ex._id).update({ data });
  }
  return ok({ state: "teacher", uid });
}

/* ---------------- 个人资料更新（头像 / 姓名 / 班级 / 年龄） ---------------- */

async function updateUserProfile(openid, data) {
  if (!openid) return fail("无法获取微信身份");
  const u = await getUser(openid);
  if (!u) return fail("用户尚未绑定身份，无法修改个人信息");

  const patch = {};
  if (data.avatarUrl !== undefined) patch.avatarUrl = String(data.avatarUrl || "").trim();
  if (data.name !== undefined) patch.name = String(data.name || "").trim();
  if (data.className !== undefined) patch.className = String(data.className || "").trim();
  if (data.age !== undefined) {
    const ageVal = String(data.age).trim();
    patch.age = ageVal === "" ? "" : Number(ageVal) || ageVal;
  }
  patch.update_time = now();

  await db.collection("users").doc(u._id).update({
    data: patch,
  });

  // 若为学员，将学员姓名和班级同步到 student_pool（便于教师端与总库展示）
  if (u.role === "student" && u.xibo_uid) {
    try {
      const poolPatch = { update_time: now() };
      if (patch.name !== undefined) poolPatch.student_name = patch.name;
      if (patch.className !== undefined) poolPatch.batch_no = patch.className;
      await db.collection("student_pool").where({ student_uid: u.xibo_uid }).update({
        data: poolPatch,
      });
    } catch (e) { /* ignore */ }
  }

  return ok({ ...u, ...patch });
}

/* ---------------- 教师学员库（PRD 四.2，强制 teacher_uid = 自己） ---------------- */

async function poolImport(openid, batchNo, uids) {
  const u = await getUser(openid);
  requireTeacher(u);
  const batch = cleanUid(batchNo);
  if (!batch) return fail("请填写批次名称，如 202607期");
  const list = (Array.isArray(uids) ? uids : []).map(cleanUid).filter(Boolean);
  const uniq = Array.from(new Set(list));
  if (uniq.length === 0) return fail("请先粘贴或导入学员 UID");
  if (uniq.length > MAX_IMPORT) return fail("单次最多导入 " + MAX_IMPORT + " 个 UID");
  let added = 0;
  let skipped = 0;
  for (const uid of uniq) {
    const ex = await db.collection("student_pool").where({ student_uid: uid }).limit(1).get();
    // 冲突处理（PRD 四.2 功能1）：已存在仅跳过，不报错中断；保留原状态（封禁不会被导入覆盖）
    if (ex.data[0]) {
      skipped++;
      continue;
    }
    await db.collection("student_pool").add({
      data: { student_uid: uid, teacher_uid: u.xibo_uid, batch_no: batch, bound_openid: "", status: 0, update_time: now() },
    });
    added++;
  }
  return ok({ added, skipped, total: uniq.length });
}

function buildPoolCond(event, teacherUid) {
  const cond = {};
  if (teacherUid !== undefined) cond.teacher_uid = teacherUid;
  if (event.batchNo) cond.batch_no = cleanUid(event.batchNo);
  if (event.uid) cond.student_uid = db.RegExp({ regexp: escapeReg(cleanUid(event.uid)), options: "i" });
  if (event.teacherUid) cond.teacher_uid = cleanUid(event.teacherUid);
  if (event.status !== undefined && event.status !== "") {
    const st = Number(event.status);
    if (!isNaN(st)) cond.status = st;
  }
  return cond;
}

async function poolList(openid, event) {
  const u = await getUser(openid);
  requireTeacher(u);
  const cond = buildPoolCond(event, u.xibo_uid);
  const page = Math.max(0, Number(event.page) || 0);
  const [cnt, list] = await Promise.all([
    db.collection("student_pool").where(cond).count(),
    db.collection("student_pool").where(cond).orderBy("update_time", "desc").skip(page * PAGE_SIZE).limit(PAGE_SIZE).get(),
  ]);
  return ok({ list: list.data, total: cnt.total, page });
}

async function poolUnbind(openid, studentUid) {
  const u = await getUser(openid);
  requireTeacher(u);
  const uid = cleanUid(studentUid);
  const upd = await db.collection("student_pool")
    .where({ student_uid: uid, teacher_uid: u.xibo_uid })
    .update({ data: { bound_openid: "", status: 0, update_time: now() } });
  if (!upd.stats || upd.stats.updated === 0) return fail("未找到您名下的该学员");
  // 同步清掉其 users 行，保证登录自检回到「未注册」而非脏角色
  await db.collection("users").where({ role: "student", xibo_uid: uid }).remove();
  return ok({});
}

async function poolRemove(openid, studentUid) {
  const u = await getUser(openid);
  requireTeacher(u);
  const uid = cleanUid(studentUid);
  const pr = await db.collection("student_pool").where({ student_uid: uid, teacher_uid: u.xibo_uid }).limit(1).get();
  const p = pr.data[0];
  if (!p) return fail("未找到您名下的该学员");
  // 受限删除（PRD 四.2 功能4）：未绑定→物理抹除；已绑定→仅解除师生归属
  if (p.status === 0) {
    await db.collection("student_pool").doc(p._id).remove();
    return ok({ mode: "deleted" });
  }
  await db.collection("student_pool").doc(p._id).update({ data: { teacher_uid: "", update_time: now() } });
  return ok({ mode: "detached" });
}

/* ---------------- 管理员（PRD 五） ---------------- */

async function adminVerify(openid, pin) {
  const expect = await getAdminPin();
  if (cleanUid(pin) !== expect) return fail("指令无效");
  const ex = await getUser(openid);
  if (!ex) {
    await db.collection("users").add({
      data: { wx_openid: openid, role: "admin", xibo_uid: "", auth_code: "", user_status: 1, create_time: now() },
    });
  } else if (ex.role !== "admin") {
    await db.collection("users").doc(ex._id).update({ data: { role: "admin", user_status: 1 } });
  }
  return ok({});
}

async function genAuthCodes(openid, count) {
  const u = await getUser(openid);
  requireAdmin(u);
  const n = Math.max(1, Math.min(Number(count) || 1, 50));
  const codes = [];
  for (let i = 0; i < n; i++) {
    let code = genCode();
    for (let t = 0; t < 5; t++) {
      const ex = await db.collection("auth_codes").where({ code }).count();
      if (ex.total === 0) break;
      code = genCode();
    }
    await db.collection("auth_codes").add({
      data: { code, status: 0, used_by_uid: "", used_by_openid: "", create_time: now() },
    });
    codes.push(code);
  }
  return ok({ codes });
}

async function listAuthCodes(openid, event) {
  const u = await getUser(openid);
  requireAdmin(u);
  const cond = {};
  if (event.status !== undefined && event.status !== "") {
    const st = Number(event.status);
    if (!isNaN(st)) cond.status = st;
  }
  const page = Math.max(0, Number(event.page) || 0);
  const [cnt, list] = await Promise.all([
    db.collection("auth_codes").where(cond).count(),
    db.collection("auth_codes").where(cond).orderBy("create_time", "desc").skip(page * PAGE_SIZE).limit(PAGE_SIZE).get(),
  ]);
  return ok({ list: list.data, total: cnt.total, page });
}

async function voidAuthCode(openid, code) {
  const u = await getUser(openid);
  requireAdmin(u);
  const c = cleanUid(code).toUpperCase();
  const upd = await db.collection("auth_codes").where({ code: c, status: 0 }).update({ data: { status: 2 } });
  if (!upd.stats || upd.stats.updated === 0) return fail("仅「未使用」的授权码可作废");
  return ok({});
}

async function listTeachers(openid, event) {
  const u = await getUser(openid);
  requireAdmin(u);
  const page = Math.max(0, Number(event.page) || 0);
  const cond = { role: "teacher" };
  if (event.uid) cond.xibo_uid = db.RegExp({ regexp: escapeReg(cleanUid(event.uid)), options: "i" });
  const [cnt, list] = await Promise.all([
    db.collection("users").where(cond).count(),
    db.collection("users").where(cond).orderBy("create_time", "desc").skip(page * PAGE_SIZE).limit(PAGE_SIZE).get(),
  ]);
  const withCounts = await Promise.all(
    list.data.map(async (t) => {
      const c = await db.collection("student_pool").where({ teacher_uid: t.xibo_uid }).count();
      return Object.assign({}, t, { studentCount: c.total });
    })
  );
  return ok({ list: withCounts, total: cnt.total, page });
}

async function setTeacherStatus(openid, uid, status) {
  const u = await getUser(openid);
  requireAdmin(u);
  const target = cleanUid(uid);
  const st = Number(status) === 2 ? 2 : 1;
  const upd = await db.collection("users").where({ role: "teacher", xibo_uid: target }).update({ data: { user_status: st } });
  if (!upd.stats || upd.stats.updated === 0) return fail("未找到该教师");
  if (st === 2) {
    // 封禁同时作废其名下仍未使用的授权码；名下学员数据原样保留（PRD 五.2B-1）
    await db.collection("auth_codes").where({ used_by_uid: target, status: 0 }).update({ data: { status: 2 } });
  }
  return ok({});
}

async function transferStudents(openid, fromUid, toUid) {
  const u = await getUser(openid);
  requireAdmin(u);
  const from = cleanUid(fromUid);
  const to = cleanUid(toUid);
  if (!to) return fail("请输入接替教师 UID");
  const t = await db.collection("users").where({ role: "teacher", xibo_uid: to }).limit(1).get();
  if (!t.data[0]) return fail("新教师 UID 未注册，请先让其用授权码注册");
  if (t.data[0].user_status === 2) return fail("新教师已被禁用，请先解封");
  const upd = await db.collection("student_pool").where({ teacher_uid: from }).update({ data: { teacher_uid: to, update_time: now() } });
  return ok({ moved: (upd.stats && upd.stats.updated) || 0 });
}

async function unbindTeacherWechat(openid, uid) {
  const u = await getUser(openid);
  requireAdmin(u);
  const target = cleanUid(uid);
  // users 以 wx_openid 为主键，换绑微信 = 删除登录记录并重置其授权码，教师用同一授权码即可在新微信上重新注册
  const del = await db.collection("users").where({ role: "teacher", xibo_uid: target }).remove();
  if (!del.stats || del.stats.removed === 0) return fail("未找到该教师");
  await db.collection("auth_codes").where({ used_by_uid: target, status: 1 }).update({
    data: { status: 0, used_by_uid: "", used_by_openid: "" },
  });
  return ok({});
}

async function deleteTeacher(openid, uid) {
  const u = await getUser(openid);
  requireAdmin(u);
  const target = cleanUid(uid);
  const del = await db.collection("users").where({ role: "teacher", xibo_uid: target }).remove();
  if (!del.stats || del.stats.removed === 0) return fail("未找到该教师");
  // 名下学员转为公共无主学员，不做物理抹除（PRD 五.2B-1 彻底删除教师）
  const upd = await db.collection("student_pool").where({ teacher_uid: target }).update({ data: { teacher_uid: "", update_time: now() } });
  return ok({ detached: (upd.stats && upd.stats.updated) || 0 });
}

async function adminImportStudents(openid, event) {
  const u = await getUser(openid);
  requireAdmin(u);
  const teacherUid = cleanUid(event.teacherUid);
  if (teacherUid) {
    const t = await db.collection("users").where({ role: "teacher", xibo_uid: teacherUid }).count();
    if (t.total === 0) return fail("归属教师未注册，请确认其已用授权码注册（或留空作为公共学员）");
  }
  const batch = cleanUid(event.batchNo);
  if (!batch) return fail("请填写批次名称，如 202607期");
  const list = (Array.isArray(event.uids) ? event.uids : []).map(cleanUid).filter(Boolean);
  const uniq = Array.from(new Set(list));
  if (uniq.length === 0) return fail("请先粘贴或导入学员 UID");
  if (uniq.length > MAX_IMPORT) return fail("单次最多导入 " + MAX_IMPORT + " 个 UID");
  let added = 0;
  let skipped = 0;
  for (const uid of uniq) {
    const ex = await db.collection("student_pool").where({ student_uid: uid }).limit(1).get();
    if (ex.data[0]) {
      skipped++;
      continue;
    }
    await db.collection("student_pool").add({
      data: { student_uid: uid, teacher_uid: teacherUid, batch_no: batch, bound_openid: "", status: 0, update_time: now() },
    });
    added++;
  }
  return ok({ added, skipped, total: uniq.length });
}

async function setStudentsTeacher(openid, uids, teacherUid) {
  const u = await getUser(openid);
  requireAdmin(u);
  const list = (Array.isArray(uids) ? uids : []).map(cleanUid).filter(Boolean);
  if (list.length === 0) return fail("请先选择学员");
  const to = cleanUid(teacherUid);
  if (to) {
    const t = await db.collection("users").where({ role: "teacher", xibo_uid: to }).count();
    if (t.total === 0) return fail("目标教师未注册（留空则转为公共学员）");
  }
  const upd = await db.collection("student_pool").where({ student_uid: _.in(list) }).update({ data: { teacher_uid: to, update_time: now() } });
  return ok({ updated: (upd.stats && upd.stats.updated) || 0 });
}

async function setStudentStatus(openid, uid, status) {
  const u = await getUser(openid);
  requireAdmin(u);
  const target = cleanUid(uid);
  const pr = await db.collection("student_pool").where({ student_uid: target }).limit(1).get();
  const p = pr.data[0];
  if (!p) return fail("未找到该学员");
  const data = { update_time: now() };
  if (Number(status) === 2) {
    data.status = 2; // 拉黑：保留 bound_openid（锁定微信）；重导入因记录已存在被跳过，维持封禁
  } else {
    data.status = p.bound_openid ? 1 : 0; // 解封
  }
  await db.collection("student_pool").doc(p._id).update({ data });
  return ok({});
}

async function forceUnbindStudent(openid, uid) {
  const u = await getUser(openid);
  requireAdmin(u);
  const target = cleanUid(uid);
  const upd = await db.collection("student_pool").where({ student_uid: target }).update({
    data: { bound_openid: "", status: 0, update_time: now() },
  });
  if (!upd.stats || upd.stats.updated === 0) return fail("未找到该学员");
  await db.collection("users").where({ role: "student", xibo_uid: target }).remove();
  return ok({});
}

async function deleteStudent(openid, uid) {
  const u = await getUser(openid);
  requireAdmin(u);
  const target = cleanUid(uid);
  const del = await db.collection("student_pool").where({ student_uid: target }).remove();
  if (!del.stats || del.stats.removed === 0) return fail("未找到该学员");
  await db.collection("users").where({ role: "student", xibo_uid: target }).remove();
  return ok({});
}

async function adminListStudents(openid, event) {
  const u = await getUser(openid);
  requireAdmin(u);
  const cond = buildPoolCond(event, undefined);
  const page = Math.max(0, Number(event.page) || 0);
  const [cnt, list] = await Promise.all([
    db.collection("student_pool").where(cond).count(),
    db.collection("student_pool").where(cond).orderBy("update_time", "desc").skip(page * PAGE_SIZE).limit(PAGE_SIZE).get(),
  ]);
  return ok({ list: list.data, total: cnt.total, page });
}

/* ---------------- 初始化（创建集合，幂等） ---------------- */

async function initDb(openid) {
  const cfg = await db.collection("config").doc("admin").get().catch(() => null);
  if (cfg && cfg.data) {
    const u = await getUser(openid);
    requireAdmin(u); // 已初始化过：仅管理员可重复执行
    return ok({ initialized: true });
  }
  const names = ["users", "student_pool", "auth_codes", "config"];
  for (const name of names) {
    try {
      await db.createCollection(name);
    } catch (e) { /* 已存在则忽略 */ }
  }
  try {
    await db.collection("config").add({ data: { _id: "admin", adminPin: DEFAULT_ADMIN_PIN, create_time: now() } });
  } catch (e) { /* 并发下可能已写入 */ }
  return ok({ initialized: true, note: "集合已创建；管理员口令默认 " + DEFAULT_ADMIN_PIN + "，可在 config 集合 admin 文档修改 adminPin" });
}

/* ---------------- 路由 ---------------- */

exports.main = async (event) => {
  const action = String((event && event.action) || "");
  const { OPENID } = cloud.getWXContext();
  try {
    switch (action) {
      case "initDb": return await initDb(OPENID);
      case "login": return ok(await doLogin(OPENID));
      case "bindStudent": return await bindStudent(OPENID, event.studentUid);
      case "bindTeacher": return await bindTeacher(OPENID, event.teacherUid, event.authCode);
      case "poolImport": return await poolImport(OPENID, event.batchNo, event.uids);
      case "poolList": return await poolList(OPENID, event);
      case "poolUnbind": return await poolUnbind(OPENID, event.studentUid);
      case "poolRemove": return await poolRemove(OPENID, event.studentUid);
      case "adminVerify": return await adminVerify(OPENID, event.pin);
      case "genAuthCodes": return await genAuthCodes(OPENID, event.count);
      case "listAuthCodes": return await listAuthCodes(OPENID, event);
      case "voidAuthCode": return await voidAuthCode(OPENID, event.code);
      case "listTeachers": return await listTeachers(OPENID, event);
      case "setTeacherStatus": return await setTeacherStatus(OPENID, event.uid, event.status);
      case "transferStudents": return await transferStudents(OPENID, event.fromUid, event.toUid);
      case "unbindTeacherWechat": return await unbindTeacherWechat(OPENID, event.uid);
      case "deleteTeacher": return await deleteTeacher(OPENID, event.uid);
      case "adminImportStudents": return await adminImportStudents(OPENID, event);
      case "setStudentsTeacher": return await setStudentsTeacher(OPENID, event.uids, event.teacherUid);
      case "setStudentStatus": return await setStudentStatus(OPENID, event.uid, event.status);
      case "forceUnbindStudent": return await forceUnbindStudent(OPENID, event.uid);
      case "deleteStudent": return await deleteStudent(OPENID, event.uid);
      case "adminListStudents": return await adminListStudents(OPENID, event);
      case "updateUserProfile": return await updateUserProfile(OPENID, event.data || event);
      default: return fail("未知操作：" + action);
    }
  } catch (e) {
    if (e && e.biz) return fail(e.biz);
    return fail("服务异常，请稍后重试");
  }
};
