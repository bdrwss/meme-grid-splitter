"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const catalog_1 = require("../../utils/catalog");
const storage_1 = require("../../utils/storage");
const api_1 = require("../../utils/api");
Page({
    data: {
        query: "",
        filtered: [],
        totalTools: 0,
        bindingActive: false,
        bindingText: "",
        cloudMode: api_1.cloudEnabled,
        banned: false,
        sessionText: "",
        sessionOk: false,
    },
    onShow() {
        this.applyFilter();
        if (api_1.cloudEnabled) {
            this.refreshCloudState();
            return;
        }
        this.refreshBinding();
    },
    /** 云端模式：登录态来自全局会话（app 启动 / 「我的」页刷新，PRD 三.1） */
    refreshCloudState() {
        const s = (0, api_1.getSession)();
        const banned = !!s && s.state === "banned";
        const bound = (0, api_1.sessionCanUseTools)(s);
        let sessionText;
        if (bound) {
            const roleText = s.state === "teacher" ? "教师" : s.state === "admin" ? "管理员" : "学员";
            sessionText = `已绑定 · ${roleText} ${s.uid || ""}`;
        }
        else if (s && s.state === "banned") {
            sessionText = "账号已被停用，无法使用工具";
        }
        else {
            sessionText = "尚未绑定身份，点击绑定";
        }
        this.setData({ banned, sessionText, sessionOk: bound });
    },
    onSearch(e) {
        this.setData({ query: e.detail.value });
        this.applyFilter();
    },
    onClear() {
        this.setData({ query: "" });
        this.applyFilter();
    },
    applyFilter() {
        const data = this.data;
        this.setData({
            filtered: (0, catalog_1.searchTools)(data.query),
            totalTools: catalog_1.TOOLS.filter((t) => t.enabled).length,
        });
    },
    refreshBinding() {
        const binding = (0, storage_1.getBinding)();
        const active = (0, storage_1.isBindingActive)(binding);
        let text;
        if (active && binding) {
            text = `已激活 · UID ${binding.uid} · 有效期至 ${binding.expiresAt.slice(0, 4)}-${binding.expiresAt.slice(4, 6)}-${binding.expiresAt.slice(6, 8)}`;
        }
        else if (binding) {
            text = "激活已过期，请重新输入激活码";
        }
        else {
            text = "尚未激活，点击输入老师提供的激活码";
        }
        this.setData({ bindingActive: active, bindingText: text });
    },
    onBindingTap() {
        if (api_1.cloudEnabled) {
            if ((0, api_1.sessionCanUseTools)((0, api_1.getSession)())) {
                wx.switchTab({ url: "/pages/profile/index" });
                return;
            }
            wx.navigateTo({ url: "/pages/rolebind/index" });
            return;
        }
        wx.navigateTo({ url: "/pages/bind/index" });
    },
    onToolTap(e) {
        const key = e.currentTarget.dataset.key;
        const tool = catalog_1.TOOLS.find((t) => t.key === key);
        if (!tool)
            return;
        if (tool.needActivation) {
            if (api_1.cloudEnabled) {
                // 云端模式：学员/教师/管理员可用；未绑定引导绑定
                if (!(0, api_1.sessionCanUseTools)((0, api_1.getSession)())) {
                    wx.navigateTo({ url: "/pages/rolebind/index" });
                    return;
                }
            }
            else if (!(0, storage_1.isBindingActive)((0, storage_1.getBinding)())) {
                wx.navigateTo({ url: "/pages/bind/index" });
                return;
            }
        }
        wx.navigateTo({ url: tool.path });
    },
});
