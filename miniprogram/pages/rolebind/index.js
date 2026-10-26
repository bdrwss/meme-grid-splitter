"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
/** 云端模式下的首次登录/绑定页（PRD 三.2：身份选择面板 → 学员/教师分支） */
Page({
    data: {
        cloudMode: api_1.cloudEnabled,
        step: "choose",
        uid: "",
        authCode: "",
        busy: false,
    },
    onShow() {
        if (!api_1.cloudEnabled) {
            wx.showToast({ title: "当前未启用云端模式", icon: "none" });
            setTimeout(() => wx.navigateBack({ fail: () => { } }), 900);
        }
    },
    onUidInput(e) {
        this.setData({ uid: e.detail.value.trim() });
    },
    onCodeInput(e) {
        this.setData({ authCode: e.detail.value.trim() });
    },
    backChoose() {
        this.setData({ step: "choose", uid: "", authCode: "" });
    },
    pickStudent() {
        this.setData({ step: "student", uid: "", authCode: "" });
    },
    pickTeacher() {
        this.setData({ step: "teacher", uid: "", authCode: "" });
    },
    /** 分支A：学员凭 UID 绑定（PRD 三.2 分支A） */
    async submitStudent() {
        const data = this.data;
        if (data.busy)
            return;
        if (!data.uid)
            return;
        this.setData({ busy: true });
        wx.showLoading({ title: "核验中…", mask: true });
        try {
            await (0, api_1.callApi)("bindStudent", { studentUid: data.uid });
            wx.hideLoading();
            wx.showToast({ title: "绑定成功", icon: "success" });
            setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/profile/index" }) }), 800);
        }
        catch (e) {
            wx.hideLoading();
            wx.showModal({ title: "绑定失败", content: (e && e.message) || "请稍后重试", showCancel: false });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    /** 分支B：教师凭 UID + 授权码注册（PRD 三.2 分支B，一码一微信死绑） */
    async submitTeacher() {
        const data = this.data;
        if (data.busy)
            return;
        if (!data.uid || !data.authCode)
            return;
        this.setData({ busy: true });
        wx.showLoading({ title: "核验中…", mask: true });
        try {
            await (0, api_1.callApi)("bindTeacher", { teacherUid: data.uid, authCode: data.authCode });
            wx.hideLoading();
            wx.showToast({ title: "注册成功", icon: "success" });
            setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/profile/index" }) }), 800);
        }
        catch (e) {
            wx.hideLoading();
            wx.showModal({ title: "注册失败", content: (e && e.message) || "授权码无效或已被使用", showCancel: false });
        }
        finally {
            this.setData({ busy: false });
        }
    },
});
