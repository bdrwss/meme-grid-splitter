import { generateStudentCode, generateTeacherCode } from "../../utils/activation";
import { isTeacherUnlocked } from "../../utils/storage";

interface ResultItem {
  uid: string;
  code: string;
  expiresText: string;
}

interface TeacherData {
  uids: string;
  days: number;
  dayOptions: number[];
  results: ResultItem[];
  teacherCode: string;
}

Page({
  data: {
    uids: "",
    days: 90,
    dayOptions: [30, 90, 180, 365],
    results: [],
    teacherCode: "",
  } as TeacherData,

  onLoad(this: any) {
    if (!isTeacherUnlocked()) {
      wx.showToast({ title: "请先在「我的」页解锁教师模式", icon: "none" });
      setTimeout(() => wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/index/index" }) }), 900);
      return;
    }
    this.setData({ teacherCode: generateTeacherCode() } as TeacherData);
  },

  onUidsInput(this: any, e: any) {
    this.setData({ uids: e.detail.value } as TeacherData);
  },

  onDaysTap(this: any, e: any) {
    this.setData({ days: Number(e.currentTarget.dataset.days) } as TeacherData);
  },

  onGenerate(this: any) {
    const data = this.data as TeacherData;
    const uids = data.uids
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (uids.length === 0) {
      wx.showToast({ title: "请输入至少一个 UID", icon: "none" });
      return;
    }
    if (uids.length > 50) {
      wx.showToast({ title: "单次最多 50 个 UID", icon: "none" });
      return;
    }
    const results = uids.map((uid) => {
      const gen = generateStudentCode(uid, data.days);
      return {
        uid,
        code: gen.code,
        expiresText: `${gen.expiresAt.slice(0, 4)}-${gen.expiresAt.slice(4, 6)}-${gen.expiresAt.slice(6, 8)}`,
      };
    });
    this.setData({ results } as TeacherData);
    wx.showToast({ title: `已生成 ${results.length} 个激活码`, icon: "success" });
  },

  onCopyAll(this: any) {
    const data = this.data as TeacherData;
    const text = data.results
      .map((r) => `UID：${r.uid}\n激活码：${r.code}\n有效期至：${r.expiresText}`)
      .join("\n\n");
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    });
  },

  onCopyTeacherCode(this: any) {
    const data = this.data as TeacherData;
    wx.setClipboardData({
      data: data.teacherCode,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    });
  },
} as any);
