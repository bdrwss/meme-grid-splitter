import {
  clearBinding,
  getBinding,
  isBindingActive,
  isTeacherUnlocked,
  lockTeacher,
  setBinding,
  unlockTeacher,
  updateBindingProfile,
  Binding,
} from "../../utils/storage";
import { callApi, cloudEnabled, refreshSession, Session } from "../../utils/api";

const VERSION = "1.2.0";

interface BindingView {
  uid: string;
  name?: string;
  className?: string;
  age?: number | string;
  avatarUrl?: string;
  expiresText: string;
  active: boolean;
  daysLeft: number;
}

let heroTapCount = 0;
let heroTapTimer: any = null;

/** "YYYYMMDD" → 距今天数（向上取整，最小 0） */
function daysUntil(yyyymmdd: string): number {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  if (!y || !m || !d) return 0;
  const target = new Date(y, m - 1, d, 23, 59, 59).getTime();
  const diff = target - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / 86400000);
}

/** 状态驱动计算头部与身份信息属性 */
function computeProfileState(
  cloudMode: boolean,
  s: Session | null,
  b: Binding | null,
  teacherUnlocked: boolean
) {
  if (cloudMode) {
    const isBanned = Boolean(s && s.state === "banned");
    if (!s || s.state === "guest" || s.state === "banned") {
      return {
        isBanned,
        isBound: false,
        userAvatar: "/avatar.png",
        displayName: "AI极客创作者工具",
        displaySub: isBanned ? "账号已被管理员停用" : "全程本地处理 · 视频不出手机",
        roleName: "",
        roleIcon: "",
        rolePillClass: "",
      };
    }
    const isStudent = s.state === "student";
    const isTeacher = s.state === "teacher";
    const roleName = isStudent ? "学员" : isTeacher ? "教师" : "管理员";
    const roleIcon = isStudent ? "🎓" : isTeacher ? "👨‍🏫" : "👑";
    const rolePillClass = isStudent ? "student" : isTeacher ? "teacher" : "admin";

    const displayName =
      s.name ||
      (isStudent
        ? `学员 · ${s.uid || ""}`
        : isTeacher
        ? `教师 · ${s.uid || ""}`
        : "超级管理员");

    const subParts: string[] = [];
    if (s.className || s.batchNo) subParts.push(s.className || s.batchNo || "");
    if (s.age) subParts.push(`${s.age} 岁`);
    if (s.uid) subParts.push(`UID: ${s.uid}`);
    const displaySub = subParts.length > 0 ? subParts.join(" · ") : "身份已认证 · 视频不出手机";

    return {
      isBanned: false,
      isBound: true,
      userAvatar: s.avatarUrl || "/avatar.png",
      displayName,
      displaySub,
      roleName,
      roleIcon,
      rolePillClass,
    };
  }

  // 离线模式
  const active = isBindingActive(b);
  if (active && b) {
    const displayName = b.name || `学员 · ${b.uid}`;
    const subParts: string[] = [];
    if (b.className) subParts.push(b.className);
    if (b.age) subParts.push(`${b.age} 岁`);
    subParts.push(`UID: ${b.uid}`);
    const displaySub = subParts.join(" · ");
    return {
      isBanned: false,
      isBound: true,
      userAvatar: b.avatarUrl || "/avatar.png",
      displayName,
      displaySub,
      roleName: "学员",
      roleIcon: "🎓",
      rolePillClass: "student",
    };
  }

  if (teacherUnlocked) {
    return {
      isBanned: false,
      isBound: true,
      userAvatar: "/avatar.png",
      displayName: "教师管理模式",
      displaySub: "本机已解锁 · 可批量生成激活码",
      roleName: "教师",
      roleIcon: "👨‍🏫",
      rolePillClass: "teacher",
    };
  }

  return {
    isBanned: false,
    isBound: false,
    userAvatar: "/avatar.png",
    displayName: "AI极客创作者工具",
    displaySub: "全程本地处理 · 视频不出手机",
    roleName: "",
    roleIcon: "",
    rolePillClass: "",
  };
}

Page({
  data: {
    cloudMode: cloudEnabled,
    session: null as Session | null,
    loading: false,
    isBanned: false,
    binding: null as BindingView | null,
    teacherUnlocked: false,
    version: VERSION,
    adminModal: false,
    adminPin: "",

    // 状态驱动 UI 计算字段
    isBound: false,
    userAvatar: "/avatar.png",
    displayName: "AI极客创作者工具",
    displaySub: "全程本地处理 · 视频不出手机",
    roleName: "",
    roleIcon: "",
    rolePillClass: "",

    // 身份选择与差异化表单弹窗 (roleModal)
    roleModalVisible: false,
    roleModalStep: "choose" as "choose" | "student" | "teacher",
    bindUid: "",
    bindCode: "",
    bindSubmitting: false,
    canSubmitBind: false,

    // 个人信息编辑弹窗 (profileModal)
    profileModalVisible: false,
    profileSubmitting: false,
    editProfile: {
      avatarUrl: "",
      name: "",
      className: "",
      age: "",
    },

    // 账户信息卡片折叠状态（默认收起）
    accountCardExpanded: false,
  },

  onShow(this: any) {
    if (cloudEnabled) {
      this.refreshCloud();
      return;
    }
    this.refreshLegacy();
  },

  /** 云端模式：每次进入页面触发状态自检（PRD 三.1） */
  async refreshCloud(this: any) {
    this.setData({ loading: true });
    try {
      const s = await refreshSession();
      const stateAttrs = computeProfileState(true, s, null, false);
      this.setData({
        session: s,
        ...stateAttrs,
        loading: false,
      });
    } catch (e: any) {
      const stateAttrs = computeProfileState(true, { state: "guest" }, null, false);
      this.setData({
        session: { state: "guest" },
        ...stateAttrs,
        loading: false,
      });
      wx.showToast({ title: (e && e.message) || "登录态获取失败", icon: "none" });
    }
  },

  /** 旧模式：本机激活信息 */
  refreshLegacy(this: any) {
    const b = getBinding();
    const active = isBindingActive(b);
    const teacherUnlocked = isTeacherUnlocked();
    const stateAttrs = computeProfileState(false, null, b, teacherUnlocked);

    this.setData({
      binding: b
        ? {
            uid: b.uid,
            name: b.name || "",
            className: b.className || "",
            age: b.age || "",
            avatarUrl: b.avatarUrl || "",
            expiresText: `${b.expiresAt.slice(0, 4)}-${b.expiresAt.slice(4, 6)}-${b.expiresAt.slice(6, 8)}`,
            active,
            daysLeft: daysUntil(b.expiresAt),
          }
        : null,
      teacherUnlocked,
      version: VERSION,
      loading: false,
      ...stateAttrs,
    });
  },

  /* ---------- 头像点击根据状态分支 ---------- */

  onAvatarClick(this: any) {
    if (this.data.isBound) {
      this.openProfileModal();
    } else {
      this.onAvatarTap();
    }
  },

  /* ---------- 账户卡片展开/收起切换 ---------- */
  toggleAccountCard(this: any) {
    this.setData({
      accountCardExpanded: !this.data.accountCardExpanded,
    });
  },

  /* ---------- 弹窗 1：身份选择与注册绑定弹窗 ---------- */

  onAvatarTap(this: any) {
    this.setData({
      roleModalVisible: true,
      roleModalStep: "choose",
      bindUid: "",
      bindCode: "",
      bindSubmitting: false,
      canSubmitBind: false,
    });
  },

  onCloseRoleModal(this: any) {
    this.setData({
      roleModalVisible: false,
      bindUid: "",
      bindCode: "",
      bindSubmitting: false,
      canSubmitBind: false,
    });
  },

  onSelectRole(this: any, e: any) {
    const role = e.currentTarget.dataset.role as "student" | "teacher";
    const uid = this.data.bindUid;
    const code = this.data.bindCode;
    const can = role === "student" ? !!uid : !!(uid && code);
    this.setData({
      roleModalStep: role,
      canSubmitBind: can,
    });
  },

  onBackToRoleChoose(this: any) {
    this.setData({
      roleModalStep: "choose",
    });
  },

  onBindUidInput(this: any, e: any) {
    const val = e.detail.value.trim();
    const can =
      this.data.roleModalStep === "student"
        ? !!val
        : !!(val && this.data.bindCode);
    this.setData({ bindUid: val, canSubmitBind: can });
  },

  onBindCodeInput(this: any, e: any) {
    const val = e.detail.value.trim();
    const can =
      this.data.roleModalStep === "student"
        ? !!this.data.bindUid
        : !!(this.data.bindUid && val);
    this.setData({ bindCode: val, canSubmitBind: can });
  },

  /**
   * 提交绑定：参考 cloudfunctions/api 中的接口定义
   * - 学员：callApi("bindStudent", { studentUid })
   * - 教师：callApi("bindTeacher", { teacherUid, authCode })
   */
  async onSubmitRoleBind(this: any) {
    const { roleModalStep, bindUid, bindCode, bindSubmitting } = this.data;
    if (bindSubmitting) return;

    if (roleModalStep === "student") {
      if (!bindUid) {
        wx.showToast({ title: "请输入学员 UID", icon: "none" });
        return;
      }
    } else if (roleModalStep === "teacher") {
      if (!bindUid || !bindCode) {
        wx.showToast({ title: "请输入 UID 与激活码", icon: "none" });
        return;
      }
    }

    // 1. 云端模式（符合 PRD 与 cloudfunctions/api 定义）
    if (cloudEnabled) {
      this.setData({ bindSubmitting: true });
      wx.showLoading({ title: "正在核验…", mask: true });
      try {
        if (roleModalStep === "student") {
          await callApi("bindStudent", { studentUid: bindUid });
          wx.hideLoading();
          wx.showToast({ title: "学员绑定成功", icon: "success" });
        } else {
          await callApi("bindTeacher", { teacherUid: bindUid, authCode: bindCode });
          wx.hideLoading();
          wx.showToast({ title: "教师激活成功", icon: "success" });
        }
        this.setData({
          roleModalVisible: false,
          bindSubmitting: false,
          bindUid: "",
          bindCode: "",
        });
        await this.refreshCloud();
      } catch (e: any) {
        wx.hideLoading();
        this.setData({ bindSubmitting: false });
        wx.showModal({
          title: "绑定失败",
          content: (e && e.message) || "接口核验异常，请稍后重试",
          showCancel: false,
        });
      }
      return;
    }

    // 2. 离线模式优雅降级（未配置 CLOUD_ENV_ID 时）
    if (roleModalStep === "student") {
      wx.showModal({
        title: "云环境未连接",
        content: `当前未配置 CLOUD_ENV_ID（云开发环境）。真实静默绑定需部署云函数 api。\n\n是否以离线测试模式在本地绑定 UID: ${bindUid}？`,
        confirmText: "离线测试",
        cancelText: "取消",
        success: (res: any) => {
          if (!res.confirm) return;
          setBinding({
            uid: bindUid,
            expiresAt: "20991231",
            boundAt: new Date().toISOString(),
          });
          this.setData({
            roleModalVisible: false,
            bindUid: "",
            bindCode: "",
          });
          this.refreshLegacy();
          wx.showToast({ title: "离线绑定成功", icon: "success" });
        },
      });
    } else {
      // 教师离线激活：尝试以离线教师码校验
      const unlockRes = unlockTeacher(bindCode);
      if (unlockRes.ok) {
        this.setData({
          roleModalVisible: false,
          bindUid: "",
          bindCode: "",
        });
        this.refreshLegacy();
        wx.showToast({ title: "教师模式已解锁", icon: "success" });
      } else {
        wx.showModal({
          title: "激活失败",
          content:
            "当前未配置云开发环境。若使用云端 8 位授权码，请先在 utils/config.ts 中配置 CLOUD_ENV_ID 并部署云函数；若使用离线教师码：" +
            (unlockRes.reason || "校验失败"),
          showCancel: false,
        });
      }
    }
  },

  /* ---------- 弹窗 2：个人信息设置 (profileModal) ---------- */

  openProfileModal(this: any) {
    let initial = {
      avatarUrl: "",
      name: "",
      className: "",
      age: "",
    };
    if (this.data.cloudMode && this.data.session) {
      const s = this.data.session;
      initial = {
        avatarUrl: s.avatarUrl || "",
        name: s.name || "",
        className: s.className || s.batchNo || "",
        age: s.age ? String(s.age) : "",
      };
    } else if (this.data.binding) {
      const b = this.data.binding;
      initial = {
        avatarUrl: b.avatarUrl || "",
        name: b.name || "",
        className: b.className || "",
        age: b.age ? String(b.age) : "",
      };
    }
    this.setData({
      profileModalVisible: true,
      editProfile: initial,
    });
  },

  closeProfileModal(this: any) {
    this.setData({ profileModalVisible: false });
  },

  onRebindFromProfileModal(this: any) {
    this.setData({ profileModalVisible: false });
    this.onAvatarTap();
  },

  onChooseAvatar(this: any) {
    const doChoose = (wx.chooseMedia as any)
      ? () =>
          new Promise<string>((resolve, reject) => {
            wx.chooseMedia({
              count: 1,
              mediaType: ["image"],
              sourceType: ["album", "camera"],
              sizeType: ["compressed"],
              success: (res: any) => resolve(res.tempFiles[0].tempFilePath),
              fail: reject,
            });
          })
      : () =>
          new Promise<string>((resolve, reject) => {
            wx.chooseImage({
              count: 1,
              sizeType: ["compressed"],
              sourceType: ["album", "camera"],
              success: (res: any) => resolve(res.tempFilePaths[0]),
              fail: reject,
            });
          });

    doChoose()
      .then(async (tempFilePath: string) => {
        if (this.data.cloudMode) {
          wx.showLoading({ title: "上传头像中…", mask: true });
          try {
            const ext = tempFilePath.split(".").pop() || "jpg";
            const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath,
              filePath: tempFilePath,
            });
            wx.hideLoading();
            this.setData({ "editProfile.avatarUrl": uploadRes.fileID });
          } catch (err) {
            wx.hideLoading();
            this.setData({ "editProfile.avatarUrl": tempFilePath });
          }
        } else {
          this.setData({ "editProfile.avatarUrl": tempFilePath });
        }
      })
      .catch(() => {});
  },

  onEditNameInput(this: any, e: any) {
    this.setData({ "editProfile.name": e.detail.value.trim() });
  },

  onEditClassInput(this: any, e: any) {
    this.setData({ "editProfile.className": e.detail.value.trim() });
  },

  onEditAgeInput(this: any, e: any) {
    this.setData({ "editProfile.age": e.detail.value.trim() });
  },

  async onSubmitProfileEdit(this: any) {
    if (this.data.profileSubmitting) return;
    const { avatarUrl, name, className, age } = this.data.editProfile;
    this.setData({ profileSubmitting: true });

    if (this.data.cloudMode) {
      wx.showLoading({ title: "正在保存…", mask: true });
      try {
        await callApi("updateUserProfile", {
          avatarUrl,
          name,
          className,
          age,
        });
        // 清除本地旧全局缓存以保持一致性
        const app = getApp();
        if (app && app.globalData) app.globalData.session = null;
        await this.refreshCloud();
        wx.hideLoading();
        this.setData({ profileModalVisible: false, profileSubmitting: false });
        wx.showToast({ title: "资料已更新", icon: "success" });
      } catch (e: any) {
        wx.hideLoading();
        this.setData({ profileSubmitting: false });
        wx.showModal({
          title: "保存失败",
          content: (e && e.message) || "保存失败，请稍后重试",
          showCancel: false,
        });
      }
      return;
    }

    // 离线模式保存
    updateBindingProfile({
      avatarUrl,
      name,
      className,
      age,
    });
    this.refreshLegacy();
    this.setData({ profileModalVisible: false, profileSubmitting: false });
    wx.showToast({ title: "资料已保存", icon: "success" });
  },

  onUnbindLegacy(this: any) {
    wx.showModal({
      title: "解除绑定",
      content: "确定解除当前本机的绑定状态吗？",
      success: (res: any) => {
        if (!res.confirm) return;
        clearBinding();
        this.refreshLegacy();
        wx.showToast({ title: "已解除绑定", icon: "none" });
      },
    });
  },

  /**
   * 品牌区域点击：
   * - 云端模式：2 秒内连点 5 次唤出「管理员验证」弹窗（PRD 五.1）
   * - 旧模式：连点 5 次唤出教师码解锁
   */
  onBrandTap(this: any) {
    if (cloudEnabled) {
      heroTapCount += 1;
      if (heroTapTimer) clearTimeout(heroTapTimer);
      heroTapTimer = setTimeout(() => {
        heroTapCount = 0;
      }, 2000);
      if (heroTapCount >= 5) {
        heroTapCount = 0;
        this.setData({ adminModal: true, adminPin: "" });
      }
      return;
    }
    if (isTeacherUnlocked()) {
      wx.navigateTo({ url: "/pages/teacher/index" });
      return;
    }
    heroTapCount += 1;
    if (heroTapTimer) clearTimeout(heroTapTimer);
    heroTapTimer = setTimeout(() => {
      heroTapCount = 0;
    }, 1500);
    if (heroTapCount >= 5) {
      heroTapCount = 0;
      wx.showModal({
        title: "教师模式",
        editable: true,
        placeholderText: "请输入教师码",
        success: (res: any) => {
          if (!res.confirm || !res.content) return;
          const r = unlockTeacher(res.content.trim());
          if (r.ok) {
            wx.showToast({ title: "教师模式已解锁", icon: "success" });
            this.onShow();
          } else {
            wx.showToast({ title: r.reason || "校验失败", icon: "none" });
          }
        },
      });
    }
  },

  /* ---------- 管理员验证弹窗（口令由云函数比对，前端无明文） ---------- */

  noop() {},

  onAdminPinInput(this: any, e: any) {
    this.setData({ adminPin: e.detail.value });
  },

  onAdminCancel(this: any) {
    this.setData({ adminModal: false, adminPin: "" });
  },

  async onAdminConfirm(this: any) {
    const pin = (this.data.adminPin || "").trim();
    if (!pin) return;
    try {
      await callApi("adminVerify", { pin });
      this.setData({ adminModal: false, adminPin: "" });
      wx.navigateTo({ url: "/pages/admin/index" });
    } catch (e: any) {
      wx.showToast({ title: (e && e.message) || "指令无效", icon: "none" });
      this.setData({ adminModal: false, adminPin: "" });
    }
  },

  /* ---------- 快捷跳转 ---------- */

  goPool(this: any) {
    wx.navigateTo({ url: "/pages/pool/index" });
  },

  goAdmin(this: any) {
    wx.navigateTo({ url: "/pages/admin/index" });
  },

  goTeacher(this: any) {
    wx.navigateTo({ url: "/pages/teacher/index" });
  },

  onLockTeacher(this: any) {
    lockTeacher();
    this.onShow();
    wx.showToast({ title: "已锁定", icon: "none" });
  },
} as any);

