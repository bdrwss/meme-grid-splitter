"use strict";
/**
 * 离线激活码体系（零后端方案）。
 *
 * 形态：激活码 = 过期日期(YYYYMMDD) + "-" + HMAC 签名前 16 位十六进制。
 * 签名内容：UID + 过期日期，密钥内置在小程序中（发版时轮换）。
 *
 * 已知边界（已在方案中向用户声明）：
 * - 密钥藏在小程序包内，理论上可被逆向；靠有效期 + 发版轮换缓解。
 * - 无法服务端远程禁用某台设备；绑定状态仅存本机。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEACHER_UNLOCK_DAYS = exports.TEACHER_SECRET = exports.STUDENT_SECRET = void 0;
exports.formatDate = formatDate;
exports.generateStudentCode = generateStudentCode;
exports.verifyStudentCode = verifyStudentCode;
exports.generateTeacherCode = generateTeacherCode;
exports.verifyTeacherCode = verifyTeacherCode;
const sha256_1 = require("./sha256");
/** 学员激活密钥：发版时轮换（如 v2 发布时改为 ...-v2，旧码全部失效） */
exports.STUDENT_SECRET = "xibo-gridtool-student-v1";
/** 教师模式密钥：仅老师持有，用于解锁小程序内的教师功能 */
exports.TEACHER_SECRET = "xibo-gridtool-teacher-v1";
/** 教师模式本机解锁有效期（天） */
exports.TEACHER_UNLOCK_DAYS = 30;
function pad2(n) {
    return n < 10 ? `0${n}` : `${n}`;
}
/** 日期 → YYYYMMDD（本地时区） */
function formatDate(d) {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}
function parseDate(yyyymmdd) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(yyyymmdd);
    if (!m)
        return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (formatDate(d) !== yyyymmdd)
        return null;
    return d;
}
function addDays(d, days) {
    const out = new Date(d.getTime());
    out.setDate(out.getDate() + days);
    return out;
}
/** 为指定 UID 生成学员激活码（有效期 days 天） */
function generateStudentCode(uid, days, now = new Date()) {
    const expires = formatDate(addDays(now, Math.max(1, Math.min(days, 365))));
    const sig = (0, sha256_1.hmacSha256Hex)(exports.STUDENT_SECRET, `${uid}:${expires}`).slice(0, 16).toUpperCase();
    return { code: `${expires}-${sig}`, expiresAt: expires };
}
/** 校验学员激活码：签名正确且未过期 */
function verifyStudentCode(uid, code, now = new Date()) {
    const trimmed = (code || "").trim().toUpperCase();
    const m = /^(\d{8})-([0-9A-F]{16})$/.exec(trimmed);
    if (!m)
        return { ok: false, reason: "激活码格式不正确" };
    const [, expiresAt, sig] = m;
    const expect = (0, sha256_1.hmacSha256Hex)(exports.STUDENT_SECRET, `${uid}:${expiresAt}`).slice(0, 16).toUpperCase();
    if (sig !== expect)
        return { ok: false, reason: "激活码校验失败，请核对 UID 与激活码" };
    const expDate = parseDate(expiresAt);
    if (!expDate)
        return { ok: false, reason: "激活码日期无效" };
    // 允许在过期日当天继续使用（含当天）
    if (formatDate(now) > expiresAt)
        return { ok: false, reason: "激活码已过期，请联系老师获取新码" };
    return { ok: true, expiresAt };
}
/** 生成本月教师解锁码（教师侧工具生成，或由本文件直接生成后发给老师自己） */
function generateTeacherCode(now = new Date()) {
    const month = `${now.getFullYear()}${pad2(now.getMonth() + 1)}`;
    return (0, sha256_1.hmacSha256Hex)(exports.TEACHER_SECRET, `teacher:${month}`).slice(0, 12).toUpperCase();
}
/** 校验教师解锁码（按月轮换：当月或上月有效，避免月底跨月立即失效） */
function verifyTeacherCode(code, now = new Date()) {
    const trimmed = (code || "").trim().toUpperCase();
    if (!/^[0-9A-F]{12}$/.test(trimmed))
        return false;
    const thisMonth = `${now.getFullYear()}${pad2(now.getMonth() + 1)}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${prev.getFullYear()}${pad2(prev.getMonth() + 1)}`;
    return (trimmed === (0, sha256_1.hmacSha256Hex)(exports.TEACHER_SECRET, `teacher:${thisMonth}`).slice(0, 12).toUpperCase() ||
        trimmed === (0, sha256_1.hmacSha256Hex)(exports.TEACHER_SECRET, `teacher:${lastMonth}`).slice(0, 12).toUpperCase());
}
