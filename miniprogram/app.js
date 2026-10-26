"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./utils/config");
const api_1 = require("./utils/api");
// 应用入口：
// - 未配置云环境（utils/config.ts 的 CLOUD_ENV_ID 为空）→ 零后端纯客户端，离线激活码模式。
// - 已配置 → 云端模式：启动即静默鉴权（云函数侧取 OpenID，无弹窗授权，PRD 三.1）。
App({
    globalData: {
        session: null,
    },
    onLaunch() {
        if (!api_1.cloudEnabled)
            return;
        wx.cloud.init({ env: config_1.CLOUD_ENV_ID, traceUser: true });
        // 静默登录失败不阻塞启动，各页面 onShow 会再次刷新
        (0, api_1.refreshSession)().catch(() => { });
    },
});
