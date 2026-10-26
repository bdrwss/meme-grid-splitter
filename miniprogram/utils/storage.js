"use strict";
/**
 * 本机存储封装：绑定状态与教师解锁（零后端，仅存本机）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBinding = getBinding;
exports.setBinding = setBinding;
exports.updateBindingProfile = updateBindingProfile;
exports.clearBinding = clearBinding;
exports.isBindingActive = isBindingActive;
exports.getTeacherUnlock = getTeacherUnlock;
exports.unlockTeacher = unlockTeacher;
exports.lockTeacher = lockTeacher;
exports.isTeacherUnlocked = isTeacherUnlocked;
const activation_1 = require("./activation");
const KEY_BINDING = "xb_binding";
const KEY_TEACHER = "xb_teacher";
function getBinding() {
    try {
        const v = wx.getStorageSync(KEY_BINDING);
        return v && v.uid ? v : null;
    }
    catch (_a) {
        return null;
    }
}
function setBinding(binding) {
    wx.setStorageSync(KEY_BINDING, binding);
}
function updateBindingProfile(patch) {
    const b = getBinding();
    if (!b)
        return;
    const updated = Object.assign({}, b, patch);
    setBinding(updated);
}
function clearBinding() {
    try {
        wx.removeStorageSync(KEY_BINDING);
    }
    catch (_a) {
        /* ignore */
    }
}
/** 绑定是否存在且未过期（过期日当天仍有效） */
function isBindingActive(binding, now = new Date()) {
    if (!binding || !binding.uid || !binding.expiresAt)
        return false;
    return (0, activation_1.formatDate)(now) <= binding.expiresAt;
}
function getTeacherUnlock() {
    try {
        const v = wx.getStorageSync(KEY_TEACHER);
        return v && v.until ? v : null;
    }
    catch (_a) {
        return null;
    }
}
/** 用教师解锁码解锁本机教师模式（30 天有效） */
function unlockTeacher(code, now = new Date()) {
    if (!(0, activation_1.verifyTeacherCode)(code, now)) {
        return { ok: false, reason: "教师码校验失败（教师码按月轮换，请向管理员获取当月码）" };
    }
    const until = new Date(now.getTime());
    until.setDate(until.getDate() + activation_1.TEACHER_UNLOCK_DAYS);
    const unlock = { until: (0, activation_1.formatDate)(until) };
    wx.setStorageSync(KEY_TEACHER, unlock);
    return { ok: true };
}
function lockTeacher() {
    try {
        wx.removeStorageSync(KEY_TEACHER);
    }
    catch (_a) {
        /* ignore */
    }
}
function isTeacherUnlocked(now = new Date()) {
    const t = getTeacherUnlock();
    return !!t && (0, activation_1.formatDate)(now) <= t.until;
}
