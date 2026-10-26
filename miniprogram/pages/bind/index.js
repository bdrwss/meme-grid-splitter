"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const activation_1 = require("../../utils/activation");
const storage_1 = require("../../utils/storage");
function toView(binding) {
    if (!binding)
        return null;
    const d = binding.expiresAt;
    return {
        uid: binding.uid,
        expiresAt: binding.expiresAt,
        expiresText: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        active: (0, storage_1.isBindingActive)(binding),
    };
}
Page({
    data: {
        uid: "",
        code: "",
        current: null,
    },
    onShow() {
        this.setData({ current: toView((0, storage_1.getBinding)()) });
    },
    onUidInput(e) {
        this.setData({ uid: e.detail.value.trim() });
    },
    onCodeInput(e) {
        this.setData({ code: e.detail.value.trim() });
    },
    onActivate() {
        const data = this.data;
        if (!data.uid || !data.code)
            return;
        const result = (0, activation_1.verifyStudentCode)(data.uid, data.code);
        if (!result.ok) {
            wx.showToast({ title: result.reason || "激活失败", icon: "none" });
            return;
        }
        (0, storage_1.setBinding)({
            uid: data.uid,
            expiresAt: result.expiresAt,
            boundAt: new Date().toISOString(),
        });
        this.setData({ current: toView((0, storage_1.getBinding)()), code: "" });
        wx.showToast({ title: "激活成功", icon: "success" });
        setTimeout(() => wx.navigateBack({ fail: () => { } }), 800);
    },
    onUnbind() {
        wx.showModal({
            title: "解除绑定",
            content: "解除后将无法使用需要激活的工具，确定继续吗？",
            success: (res) => {
                if (!res.confirm)
                    return;
                (0, storage_1.clearBinding)();
                this.setData({ current: null });
                wx.showToast({ title: "已解除", icon: "none" });
            },
        });
    },
});
