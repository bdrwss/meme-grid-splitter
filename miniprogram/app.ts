import { CLOUD_ENV_ID } from "./utils/config";
import { cloudEnabled, refreshSession, Session } from "./utils/api";

// 应用入口：
// - 未配置云环境（utils/config.ts 的 CLOUD_ENV_ID 为空）→ 零后端纯客户端，离线激活码模式。
// - 已配置 → 云端模式：启动即静默鉴权（云函数侧取 OpenID，无弹窗授权，PRD 三.1）。
App({
  globalData: {
    session: null as Session | null,
  },

  onLaunch() {
    if (!cloudEnabled) return;
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });
    // 静默登录失败不阻塞启动，各页面 onShow 会再次刷新
    refreshSession().catch(() => {});
  },
} as any);
