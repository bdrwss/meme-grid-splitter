/**
 * 本机存储封装：绑定状态与教师解锁（零后端，仅存本机）。
 */

import {
  TEACHER_UNLOCK_DAYS,
  formatDate,
  verifyTeacherCode,
  VerifyResult,
} from "./activation";

const KEY_BINDING = "xb_binding";
const KEY_TEACHER = "xb_teacher";

export interface Binding {
  uid: string;
  expiresAt: string; // YYYYMMDD
  boundAt: string;
  name?: string;
  avatarUrl?: string;
  className?: string;
  age?: number | string;
}

export interface TeacherUnlock {
  until: string; // YYYYMMDD
}

export function getBinding(): Binding | null {
  try {
    const v = wx.getStorageSync(KEY_BINDING);
    return v && v.uid ? (v as Binding) : null;
  } catch {
    return null;
  }
}

export function setBinding(binding: Binding) {
  wx.setStorageSync(KEY_BINDING, binding);
}

export function updateBindingProfile(patch: { name?: string; avatarUrl?: string; className?: string; age?: number | string }) {
  const b = getBinding();
  if (!b) return;
  const updated = Object.assign({}, b, patch);
  setBinding(updated);
}

export function clearBinding() {
  try {
    wx.removeStorageSync(KEY_BINDING);
  } catch {
    /* ignore */
  }
}

/** 绑定是否存在且未过期（过期日当天仍有效） */
export function isBindingActive(binding: Binding | null, now = new Date()): boolean {
  if (!binding || !binding.uid || !binding.expiresAt) return false;
  return formatDate(now) <= binding.expiresAt;
}

export function getTeacherUnlock(): TeacherUnlock | null {
  try {
    const v = wx.getStorageSync(KEY_TEACHER);
    return v && v.until ? (v as TeacherUnlock) : null;
  } catch {
    return null;
  }
}

/** 用教师解锁码解锁本机教师模式（30 天有效） */
export function unlockTeacher(code: string, now = new Date()): { ok: boolean; reason?: string } {
  if (!verifyTeacherCode(code, now)) {
    return { ok: false, reason: "教师码校验失败（教师码按月轮换，请向管理员获取当月码）" };
  }
  const until = new Date(now.getTime());
  until.setDate(until.getDate() + TEACHER_UNLOCK_DAYS);
  const unlock: TeacherUnlock = { until: formatDate(until) };
  wx.setStorageSync(KEY_TEACHER, unlock);
  return { ok: true };
}

export function lockTeacher() {
  try {
    wx.removeStorageSync(KEY_TEACHER);
  } catch {
    /* ignore */
  }
}

export function isTeacherUnlocked(now = new Date()): boolean {
  const t = getTeacherUnlock();
  return !!t && formatDate(now) <= t.until;
}
