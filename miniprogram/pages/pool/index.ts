import { callApi, parseUidText } from "../../utils/api";

interface StudentRow {
  _id: string;
  student_uid: string;
  batch_no: string;
  teacher_uid: string;
  bound_openid: string;
  status: number;
}

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ["全部状态", "未绑定", "已绑定", "已封禁"];
const STATUS_VALUES = ["", 0, 1, 2];

/** 教师视图：我的学员库（PRD 四.2，后端强制 teacher_uid = 当前教师） */
Page({
  data: {
    // 功能1：分批次批量上传
    batchNo: "",
    uidsText: "",
    importing: false,
    // 功能2：筛选
    statusOptions: STATUS_OPTIONS,
    statusIndex: 0,
    fBatch: "",
    fUid: "",
    // 列表
    list: [] as StudentRow[],
    total: 0,
    page: 0,
    loading: false,
    hasMore: true,
  },

  onShow(this: any) {
    this.reload();
  },

  onBatchInput(this: any, e: any) {
    this.setData({ batchNo: e.detail.value });
  },

  onUidsInput(this: any, e: any) {
    this.setData({ uidsText: e.detail.value });
  },

  onFBatch(this: any, e: any) {
    this.setData({ fBatch: e.detail.value });
  },

  onFUid(this: any, e: any) {
    this.setData({ fUid: e.detail.value });
  },

  onStatusPick(this: any, e: any) {
    this.setData({ statusIndex: Number(e.detail.value) });
    this.reload();
  },

  reloadFilters(this: any) {
    this.reload();
  },

  /* ---------- 功能1：批量导入（粘贴 / 聊天文件） ---------- */

  /** wx.chooseMessageFile 选择微信聊天中的 CSV/TXT 文件（PRD 四.2 功能1） */
  pickFile(this: any) {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["csv", "txt"],
      success: (res: any) => {
        const f = res.tempFiles && res.tempFiles[0];
        if (!f) return;
        wx.getFileSystemManager().readFile({
          filePath: f.path,
          encoding: "utf-8",
          success: (r: any) => {
            const uids = parseUidText(String(r.data || ""));
            if (uids.length === 0) {
              wx.showToast({ title: "文件中没有解析到 UID", icon: "none" });
              return;
            }
            this.setData({ uidsText: uids.join("\n") });
            wx.showToast({ title: "已解析 " + uids.length + " 个 UID", icon: "none" });
          },
          fail: () => wx.showToast({ title: "文件读取失败", icon: "none" }),
        });
      },
    });
  },

  async importUids(this: any) {
    const data = this.data as any;
    if (data.importing) return;
    const uids = parseUidText(data.uidsText);
    if (!data.batchNo.trim()) {
      wx.showToast({ title: "请填写批次名称，如 202607期", icon: "none" });
      return;
    }
    if (uids.length === 0) {
      wx.showToast({ title: "请先粘贴或导入学员 UID", icon: "none" });
      return;
    }
    this.setData({ importing: true });
    wx.showLoading({ title: "导入中…", mask: true });
    try {
      const r = await callApi<any>("poolImport", { batchNo: data.batchNo.trim(), uids });
      wx.hideLoading();
      const msg = "新增 " + r.added + " 个，跳过重复 " + r.skipped + " 个";
      wx.showModal({ title: "导入完成", content: msg, showCancel: false });
      this.setData({ uidsText: "" });
      this.reload();
    } catch (e: any) {
      wx.hideLoading();
      wx.showModal({ title: "导入失败", content: (e && e.message) || "请稍后重试", showCancel: false });
    } finally {
      this.setData({ importing: false });
    }
  },

  /* ---------- 功能2：列表查询（分页） ---------- */

  buildQuery(this: any, page: number) {
    const data = this.data as any;
    return {
      page,
      batchNo: data.fBatch.trim(),
      uid: data.fUid.trim(),
      status: STATUS_VALUES[data.statusIndex],
    };
  },

  async reload(this: any) {
    this.setData({ loading: true, page: 0, list: [], hasMore: true });
    try {
      const r = await callApi<any>("poolList", this.buildQuery(0));
      this.setData({
        list: r.list as StudentRow[],
        total: r.total,
        hasMore: r.list.length < r.total,
        loading: false,
      });
    } catch (e: any) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || "加载失败", icon: "none" });
    }
  },

  async loadMore(this: any) {
    const data = this.data as any;
    if (data.loading || !data.hasMore) return;
    const next = data.page + 1;
    this.setData({ loading: true });
    try {
      const r = await callApi<any>("poolList", this.buildQuery(next));
      this.setData({
        list: data.list.concat(r.list as StudentRow[]),
        page: next,
        hasMore: data.list.length + r.list.length < r.total,
        loading: false,
      });
    } catch (e: any) {
      this.setData({ loading: false });
    }
  },

  onReachBottom(this: any) {
    this.loadMore();
  },

  /* ---------- 功能3：解绑微信（换绑运维） ---------- */

  unbindItem(this: any, e: any) {
    const uid = e.currentTarget.dataset.id;
    wx.showModal({
      title: "解绑微信",
      content: "将清空 " + uid + " 的微信绑定，允许学员用新微信号重新绑定。确定继续吗？",
      success: async (res: any) => {
        if (!res.confirm) return;
        try {
          await callApi("poolUnbind", { studentUid: uid });
          wx.showToast({ title: "已解绑", icon: "success" });
          this.reload();
        } catch (err: any) {
          wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
        }
      },
    });
  },

  /* ---------- 功能4：受限删除（未绑定→物理删除；已绑定→仅解除归属） ---------- */

  removeItem(this: any, e: any) {
    const uid = e.currentTarget.dataset.id;
    const status = Number(e.currentTarget.dataset.status);
    const isUnbound = status === 0;
    wx.showModal({
      title: isUnbound ? "删除学员" : "移除学员",
      content: isUnbound
        ? uid + " 尚未绑定微信，将从学员总表中彻底删除（适用于录入错误）。该操作不可恢复，确定继续吗？"
        : uid + " 已绑定微信，仅解除与你的师生归属关系，学员账号保留不受影响。确定继续吗？",
      success: async (res: any) => {
        if (!res.confirm) return;
        try {
          const r = await callApi<any>("poolRemove", { studentUid: uid });
          wx.showToast({ title: r.mode === "deleted" ? "已删除" : "已移除", icon: "success" });
          this.reload();
        } catch (err: any) {
          wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
        }
      },
    });
  },
} as any);
