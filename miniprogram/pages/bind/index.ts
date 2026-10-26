import { verifyStudentCode } from "../../utils/activation";
import { clearBinding, getBinding, isBindingActive, setBinding } from "../../utils/storage";

interface CurrentBindingView {
  uid: string;
  expiresAt: string;
  expiresText: string;
  active: boolean;
}

interface BindData {
  uid: string;
  code: string;
  current: CurrentBindingView | null;
}

function toView(binding: ReturnType<typeof getBinding>): CurrentBindingView | null {
  if (!binding) return null;
  const d = binding.expiresAt;
  return {
    uid: binding.uid,
    expiresAt: binding.expiresAt,
    expiresText: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
    active: isBindingActive(binding),
  };
}

Page({
  data: {
    uid: "",
    code: "",
    current: null,
  } as BindData,

  onShow(this: any) {
    this.setData({ current: toView(getBinding()) } as BindData);
  },

  onUidInput(this: any, e: any) {
    this.setData({ uid: e.detail.value.trim() } as BindData);
  },

  onCodeInput(this: any, e: any) {
    this.setData({ code: e.detail.value.trim() } as BindData);
  },

  onActivate(this: any) {
    const data = this.data as BindData;
    if (!data.uid || !data.code) return;
    const result = verifyStudentCode(data.uid, data.code);
    if (!result.ok) {
      wx.showToast({ title: result.reason || "激活失败", icon: "none" });
      return;
    }
    setBinding({
      uid: data.uid,
      expiresAt: result.expiresAt as string,
      boundAt: new Date().toISOString(),
    });
    this.setData({ current: toView(getBinding()), code: "" } as BindData);
    wx.showToast({ title: "激活成功", icon: "success" });
    setTimeout(() => wx.navigateBack({ fail: () => {} }), 800);
  },

  onUnbind(this: any) {
    wx.showModal({
      title: "解除绑定",
      content: "解除后将无法使用需要激活的工具，确定继续吗？",
      success: (res: any) => {
        if (!res.confirm) return;
        clearBinding();
        this.setData({ current: null } as BindData);
        wx.showToast({ title: "已解除", icon: "none" });
      },
    });
  },
} as any);
