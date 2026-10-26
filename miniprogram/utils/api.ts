/**
 * 云函数 api 调用封装（PRD 云端模式的客户端数据层）。
 *
 * 身份识别全部由云函数侧 getWXContext().OPENID 完成，前端不传、也不可传身份，
 * 对应 PRD「底层静默鉴权」与「口令后端比对」的安全要求。
 */

import { CLOUD_ENV_ID } from "./config";

export interface Session {
  /** guest 未注册 / banned 已封禁 / student 学员 / teacher 教师 / admin 管理员 */
  state: "guest" | "banned" | "student" | "teacher" | "admin";
  uid?: string;
  batchNo?: string;
  teacherUid?: string;
  name?: string;
  avatarUrl?: string;
  className?: string;
  age?: number | string;
}

/** 云端模式是否可用（未配置环境 ID 时保持旧的离线激活码模式） */
export const cloudEnabled = !!CLOUD_ENV_ID && !!wx.cloud;

/** 统一调用云函数 api；失败抛 Error(reason)，reason 为可直接展示的文案 */
export function callApi<T = any>(action: string, data?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: "api",
      data: Object.assign({ action }, data || {}),
      success: (res: any) => {
        const r = res && res.result;
        if (r && r.ok) resolve(r.data as T);
        else reject(new Error((r && r.reason) || "服务异常，请稍后重试"));
      },
      fail: () => reject(new Error("网络异常，请检查云开发环境配置")),
    });
  });
}

/** 静默登录并写入全局会话（PRD 三.1：每次进入小程序/「我的」页触发） */
export async function refreshSession(): Promise<Session> {
  const s = await callApi<Session>("login");
  const app = getApp();
  if (app && app.globalData) app.globalData.session = s;
  return s;
}

export function getSession(): Session | null {
  const app = getApp();
  return (app && app.globalData && app.globalData.session) || null;
}

/** 可使用工具的身份：学员 / 教师 / 管理员 */
export function sessionCanUseTools(s: Session | null): boolean {
  return !!s && (s.state === "student" || s.state === "teacher" || s.state === "admin");
}

/** 长文本拆 UID 数组：按换行/逗号/分号/制表符拆解并去重（PRD 四.2 功能1） */
export function parseUidText(text: string): string[] {
  return Array.from(
    new Set(
      String(text || "")
        .split(/[\n,;，；\t]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}
