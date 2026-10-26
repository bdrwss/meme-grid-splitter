import { TOOLS, searchTools, ToolItem } from "../../utils/catalog";
import { getBinding, isBindingActive } from "../../utils/storage";
import { cloudEnabled, getSession, sessionCanUseTools } from "../../utils/api";

interface IndexData {
  query: string;
  filtered: ToolItem[];
  totalTools: number;
  bindingActive: boolean;
  bindingText: string;
  cloudMode: boolean;
  banned: boolean;
  sessionText: string;
  sessionOk: boolean;
}

Page({
  data: {
    query: "",
    filtered: [],
    totalTools: 0,
    bindingActive: false,
    bindingText: "",
    cloudMode: cloudEnabled,
    banned: false,
    sessionText: "",
    sessionOk: false,
  } as IndexData,

  onShow(this: any) {
    this.applyFilter();
    if (cloudEnabled) {
      this.refreshCloudState();
      return;
    }
    this.refreshBinding();
  },

  /** 云端模式：登录态来自全局会话（app 启动 / 「我的」页刷新，PRD 三.1） */
  refreshCloudState(this: any) {
    const s = getSession();
    const banned = !!s && s.state === "banned";
    const bound = sessionCanUseTools(s);
    let sessionText: string;
    if (bound) {
      const roleText = s!.state === "teacher" ? "教师" : s!.state === "admin" ? "管理员" : "学员";
      sessionText = `已绑定 · ${roleText} ${s!.uid || ""}`;
    } else if (s && s.state === "banned") {
      sessionText = "账号已被停用，无法使用工具";
    } else {
      sessionText = "尚未绑定身份，点击绑定";
    }
    this.setData({ banned, sessionText, sessionOk: bound } as IndexData);
  },

  onSearch(e: any) {
    this.setData({ query: e.detail.value } as IndexData);
    this.applyFilter();
  },

  onClear(this: any) {
    this.setData({ query: "" } as IndexData);
    this.applyFilter();
  },

  applyFilter(this: any) {
    const data = this.data as IndexData;
    this.setData({
      filtered: searchTools(data.query),
      totalTools: TOOLS.filter((t) => t.enabled).length,
    } as IndexData);
  },

  refreshBinding(this: any) {
    const binding = getBinding();
    const active = isBindingActive(binding);
    let text: string;
    if (active && binding) {
      text = `已激活 · UID ${binding.uid} · 有效期至 ${binding.expiresAt.slice(0, 4)}-${binding.expiresAt.slice(4, 6)}-${binding.expiresAt.slice(6, 8)}`;
    } else if (binding) {
      text = "激活已过期，请重新输入激活码";
    } else {
      text = "尚未激活，点击输入老师提供的激活码";
    }
    this.setData({ bindingActive: active, bindingText: text } as IndexData);
  },

  onBindingTap(this: any) {
    if (cloudEnabled) {
      if (sessionCanUseTools(getSession())) {
        wx.switchTab({ url: "/pages/profile/index" });
        return;
      }
      wx.navigateTo({ url: "/pages/rolebind/index" });
      return;
    }
    wx.navigateTo({ url: "/pages/bind/index" });
  },

  onToolTap(this: any, e: any) {
    const key = e.currentTarget.dataset.key as string;
    const tool = TOOLS.find((t) => t.key === key);
    if (!tool) return;
    if (tool.needActivation) {
      if (cloudEnabled) {
        // 云端模式：学员/教师/管理员可用；未绑定引导绑定
        if (!sessionCanUseTools(getSession())) {
          wx.navigateTo({ url: "/pages/rolebind/index" });
          return;
        }
      } else if (!isBindingActive(getBinding())) {
        wx.navigateTo({ url: "/pages/bind/index" });
        return;
      }
    }
    wx.navigateTo({ url: tool.path });
  },
} as any);
