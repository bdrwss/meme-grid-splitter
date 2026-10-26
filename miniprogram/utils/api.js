"use strict";
/**
 * 云函数 api 调用封装（PRD 云端模式的客户端数据层）。
 *
 * 身份识别全部由云函数侧 getWXContext().OPENID 完成，前端不传、也不可传身份，
 * 对应 PRD「底层静默鉴权」与「口令后端比对」的安全要求。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudEnabled = void 0;
exports.callApi = callApi;
exports.refreshSession = refreshSession;
exports.getSession = getSession;
exports.sessionCanUseTools = sessionCanUseTools;
exports.parseUidText = parseUidText;
const config_1 = require("./config");
/** 云端模式是否可用（未配置环境 ID 时保持旧的离线激活码模式） */
exports.cloudEnabled = !!config_1.CLOUD_ENV_ID && !!wx.cloud;
/** 统一调用云函数 api；失败抛 Error(reason)，reason 为可直接展示的文案 */
function callApi(action, data) {
    return new Promise((resolve, reject) => {
        wx.cloud.callFunction({
            name: "api",
            data: Object.assign({ action }, data || {}),
            success: (res) => {
                const r = res && res.result;
                if (r && r.ok)
                    resolve(r.data);
                else
                    reject(new Error((r && r.reason) || "服务异常，请稍后重试"));
            },
            fail: () => reject(new Error("网络异常，请检查云开发环境配置")),
        });
    });
}
/** 静默登录并写入全局会话（PRD 三.1：每次进入小程序/「我的」页触发） */
async function refreshSession() {
    const s = await callApi("login");
    const app = getApp();
    if (app && app.globalData)
        app.globalData.session = s;
    return s;
}
function getSession() {
    const app = getApp();
    return (app && app.globalData && app.globalData.session) || null;
}
/** 可使用工具的身份：学员 / 教师 / 管理员 */
function sessionCanUseTools(s) {
    return !!s && (s.state === "student" || s.state === "teacher" || s.state === "admin");
}
/** 长文本拆 UID 数组：按换行/逗号/分号/制表符拆解并去重（PRD 四.2 功能1） */
function parseUidText(text) {
    return Array.from(new Set(String(text || "")
        .split(/[\n,;，；\t]+/)
        .map((s) => s.trim())
        .filter(Boolean)));
}
