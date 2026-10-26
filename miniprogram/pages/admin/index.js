"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const PAGE_SIZE = 20;
const CODE_FILTERS = ["全部", "未使用", "已使用", "已作废"];
const CODE_STATUS_VALUES = ["", 0, 1, 2];
const STU_FILTERS = ["全部状态", "未绑定", "已绑定", "已封禁"];
const STU_STATUS_VALUES = ["", 0, 1, 2];
function fmtTime(v) {
    if (!v)
        return "—";
    const d = new Date(v);
    if (isNaN(d.getTime()))
        return "—";
    const p = (n) => (n < 10 ? "0" + n : "" + n);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** 超级管理员后台（PRD 五：隐藏彩蛋进入，最高权限） */
Page({
    data: {
        tab: "codes",
        // 模块A：授权码
        codeFilters: CODE_FILTERS,
        codeFilterIndex: 0,
        genCount: "1",
        codes: [],
        codesTotal: 0,
        codesPage: 0,
        codesHasMore: true,
        // 模块B-1：教师管控
        teachers: [],
        teachersTotal: 0,
        teachersPage: 0,
        teachersHasMore: true,
        // 模块B-2：一级总学员库
        stuFilters: STU_FILTERS,
        stuStatusIndex: 0,
        sUid: "",
        sBatch: "",
        students: [],
        studentsTotal: 0,
        studentsPage: 0,
        studentsHasMore: true,
        importPanel: false,
        iBatch: "",
        iUids: "",
        iTeacherUid: "",
        loading: false,
    },
    onShow() {
        this.reloadActive();
    },
    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        if (tab === this.data.tab)
            return;
        this.setData({ tab });
        this.reloadActive();
    },
    reloadActive() {
        const tab = this.data.tab;
        if (tab === "codes")
            this.loadCodes();
        else if (tab === "teachers")
            this.loadTeachers();
        else
            this.loadStudents();
    },
    async fetchPaged(action, query) {
        const r = await (0, api_1.callApi)(action, query);
        return { list: r.list || [], total: r.total || 0, page: r.page || 0 };
    },
    /* ================= 模块A：教师授权码生成器（PRD 五.2A） ================= */
    onGenCount(e) {
        this.setData({ genCount: e.detail.value });
    },
    async genCodes() {
        const n = Math.max(1, Math.min(Number(this.data.genCount) || 1, 50));
        wx.showLoading({ title: "生成中…", mask: true });
        try {
            const r = await (0, api_1.callApi)("genAuthCodes", { count: n });
            wx.hideLoading();
            wx.setClipboardData({
                data: r.codes.join("\n"),
                success: () => wx.showToast({ title: "已生成并复制", icon: "success" }),
                fail: () => wx.showToast({ title: "已生成 " + r.codes.length + " 个", icon: "success" }),
            });
            this.setData({ codeFilterIndex: 0 });
            this.loadCodes();
        }
        catch (e) {
            wx.hideLoading();
            wx.showToast({ title: (e && e.message) || "生成失败", icon: "none" });
        }
    },
    onCodeFilterPick(e) {
        this.setData({ codeFilterIndex: Number(e.detail.value) });
        this.loadCodes();
    },
    async loadCodes() {
        this.setData({ loading: true, codesPage: 0, codesHasMore: true });
        const data = this.data;
        try {
            const r = await this.fetchPaged("listAuthCodes", {
                page: 0,
                status: CODE_STATUS_VALUES[data.codeFilterIndex],
            });
            this.setData({
                codes: r.list.map((x) => Object.assign({}, x, { timeText: fmtTime(x.used_time || x.create_time) })),
                codesTotal: r.total,
                codesHasMore: r.list.length < r.total,
                loading: false,
            });
        }
        catch (e) {
            this.setData({ loading: false });
            wx.showToast({ title: (e && e.message) || "加载失败", icon: "none" });
        }
    },
    copyCode(e) {
        wx.setClipboardData({
            data: e.currentTarget.dataset.code,
            success: () => wx.showToast({ title: "已复制", icon: "success" }),
        });
    },
    voidCode(e) {
        const code = e.currentTarget.dataset.code;
        wx.showModal({
            title: "作废授权码",
            content: code + " 将被作废，任何人无法再用它注册教师。确定继续吗？",
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await (0, api_1.callApi)("voidAuthCode", { code });
                    wx.showToast({ title: "已作废", icon: "success" });
                    this.loadCodes();
                }
                catch (err) {
                    wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    /* ================= 模块B-1：教师管控（PRD 五.2B-1） ================= */
    async loadTeachers() {
        this.setData({ loading: true, teachersPage: 0, teachersHasMore: true });
        try {
            const r = await this.fetchPaged("listTeachers", { page: 0 });
            this.setData({
                teachers: r.list.map((x) => Object.assign({}, x, { timeText: fmtTime(x.create_time) })),
                teachersTotal: r.total,
                teachersHasMore: r.list.length < r.total,
                loading: false,
            });
        }
        catch (e) {
            this.setData({ loading: false });
            wx.showToast({ title: (e && e.message) || "加载失败", icon: "none" });
        }
    },
    /** 禁用/封杀教师 ↔ 解封（PRD 五.2B-1） */
    toggleTeacher(e) {
        const uid = e.currentTarget.dataset.uid;
        const status = Number(e.currentTarget.dataset.status);
        const banning = status !== 2;
        wx.showModal({
            title: banning ? "禁用教师" : "解封教师",
            content: banning
                ? uid + " 将被禁用：无法打开小程序，其名下学员数据完好保留。确定继续吗？"
                : "恢复 " + uid + " 的正常使用。确定继续吗？",
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await (0, api_1.callApi)("setTeacherStatus", { uid, status: banning ? 2 : 1 });
                    wx.showToast({ title: banning ? "已禁用" : "已解封", icon: "success" });
                    this.loadTeachers();
                }
                catch (err) {
                    wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    /** 一键划转名下学员（PRD 五.2B-1） */
    transferTeacher(e) {
        const uid = e.currentTarget.dataset.uid;
        wx.showModal({
            title: "划转学员",
            editable: true,
            placeholderText: "输入接替的新教师 UID",
            success: async (res) => {
                if (!res.confirm || !res.content)
                    return;
                try {
                    const r = await (0, api_1.callApi)("transferStudents", { fromUid: uid, toUid: res.content.trim() });
                    wx.showModal({ title: "划转完成", content: "已划转 " + r.moved + " 名学员到 " + res.content.trim(), showCancel: false });
                    this.loadTeachers();
                }
                catch (err) {
                    wx.showModal({ title: "划转失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    /** 解绑教师微信：删除登录记录并重置其授权码，教师在新微信上用原授权码重新注册 */
    unbindTeacherWechat(e) {
        const uid = e.currentTarget.dataset.uid;
        wx.showModal({
            title: "解绑教师微信",
            content: uid + " 的微信绑定将被清空，其授权码重置为未使用；教师需用该授权码在新微信上重新注册。确定继续吗？",
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await (0, api_1.callApi)("unbindTeacherWechat", { uid });
                    wx.showToast({ title: "已解绑", icon: "success" });
                    this.loadTeachers();
                }
                catch (err) {
                    wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    /** 彻底删除教师：名下学员转为公共无主学员（PRD 五.2B-1） */
    deleteTeacher(e) {
        const uid = e.currentTarget.dataset.uid;
        wx.showModal({
            title: "彻底删除教师",
            content: uid + " 的教师记录将被物理删除，名下全部学员转为公共学员（数据不丢失）。该操作不可恢复，确定继续吗？",
            confirmColor: "#dc2626",
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    const r = await (0, api_1.callApi)("deleteTeacher", { uid });
                    wx.showToast({ title: "已删除（释放 " + r.detached + " 名学员）", icon: "none" });
                    this.loadTeachers();
                }
                catch (err) {
                    wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    /* ================= 模块B-2：一级总学员库（PRD 五.2B-2） ================= */
    onSUid(e) {
        this.setData({ sUid: e.detail.value });
    },
    onSBatch(e) {
        this.setData({ sBatch: e.detail.value });
    },
    onStuFilterPick(e) {
        this.setData({ stuStatusIndex: Number(e.detail.value) });
        this.loadStudents();
    },
    reloadStudents() {
        this.loadStudents();
    },
    async loadStudents() {
        const data = this.data;
        this.setData({ loading: true, studentsPage: 0, studentsHasMore: true });
        try {
            const r = await this.fetchPaged("adminListStudents", {
                page: 0,
                uid: data.sUid.trim(),
                batchNo: data.sBatch.trim(),
                status: STU_STATUS_VALUES[data.stuStatusIndex],
            });
            this.setData({
                students: r.list,
                studentsTotal: r.total,
                studentsHasMore: r.list.length < r.total,
                loading: false,
            });
        }
        catch (e) {
            this.setData({ loading: false });
            wx.showToast({ title: (e && e.message) || "加载失败", icon: "none" });
        }
    },
    toggleImportPanel() {
        this.setData({ importPanel: !this.data.importPanel });
    },
    onIBatch(e) {
        this.setData({ iBatch: e.detail.value });
    },
    onIUids(e) {
        this.setData({ iUids: e.detail.value });
    },
    onITeacherUid(e) {
        this.setData({ iTeacherUid: e.detail.value.trim() });
    },
    /** 公共批量录入（PRD 五.2B-2）：归属教师可留空作为公共学员 */
    async adminImport() {
        const data = this.data;
        if (!data.iBatch.trim()) {
            wx.showToast({ title: "请填写批次名称", icon: "none" });
            return;
        }
        const uids = (0, api_1.parseUidText)(data.iUids);
        if (uids.length === 0) {
            wx.showToast({ title: "请粘贴学员 UID", icon: "none" });
            return;
        }
        wx.showLoading({ title: "导入中…", mask: true });
        try {
            const r = await (0, api_1.callApi)("adminImportStudents", {
                batchNo: data.iBatch.trim(),
                uids,
                teacherUid: data.iTeacherUid.trim(),
            });
            wx.hideLoading();
            wx.showModal({
                title: "导入完成",
                content: "新增 " + r.added + " 个，跳过重复 " + r.skipped + " 个",
                showCancel: false,
            });
            this.setData({ iUids: "", importPanel: false });
            this.loadStudents();
        }
        catch (e) {
            wx.hideLoading();
            wx.showModal({ title: "导入失败", content: (e && e.message) || "", showCancel: false });
        }
    },
    /** 修改归属教师（支持跨老师调班，留空转公共学员） */
    setStudentTeacher(e) {
        const uid = e.currentTarget.dataset.uid;
        wx.showModal({
            title: "修改归属教师",
            editable: true,
            placeholderText: "输入新教师 UID（留空转为公共学员）",
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await (0, api_1.callApi)("setStudentsTeacher", { uids: [uid], teacherUid: (res.content || "").trim() });
                    wx.showToast({ title: "已修改", icon: "success" });
                    this.loadStudents();
                }
                catch (err) {
                    wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    /** 禁用/拉黑 ↔ 解封（PRD 五.2B-2） */
    toggleStudent(e) {
        const uid = e.currentTarget.dataset.uid;
        const status = Number(e.currentTarget.dataset.status);
        const banning = status !== 2;
        wx.showModal({
            title: banning ? "禁用学员" : "解封学员",
            content: banning
                ? uid + " 将被拉黑：立即被小程序拦截，且后续重新导入名单也保持封禁。确定继续吗？"
                : "恢复 " + uid + " 的正常状态。确定继续吗？",
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await (0, api_1.callApi)("setStudentStatus", { uid, status: banning ? 2 : 1 });
                    wx.showToast({ title: banning ? "已拉黑" : "已解封", icon: "success" });
                    this.loadStudents();
                }
                catch (err) {
                    wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    forceUnbindStudent(e) {
        const uid = e.currentTarget.dataset.uid;
        wx.showModal({
            title: "强制解绑微信",
            content: "将清空 " + uid + " 的微信绑定，学员可用任意新微信重新绑定该 UID。确定继续吗？",
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await (0, api_1.callApi)("forceUnbindStudent", { uid });
                    wx.showToast({ title: "已解绑", icon: "success" });
                    this.loadStudents();
                }
                catch (err) {
                    wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    /** 彻底删除 UID：student_pool + users 物理抹除（PRD 五.2B-2） */
    deleteStudent(e) {
        const uid = e.currentTarget.dataset.uid;
        wx.showModal({
            title: "彻底删除 UID",
            content: uid + " 将从学员总表与用户表中物理抹除（适用于清理错录废数据），删除后可被重新导入。该操作不可恢复，确定继续吗？",
            confirmColor: "#dc2626",
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await (0, api_1.callApi)("deleteStudent", { uid });
                    wx.showToast({ title: "已删除", icon: "success" });
                    this.loadStudents();
                }
                catch (err) {
                    wx.showModal({ title: "操作失败", content: (err && err.message) || "", showCancel: false });
                }
            },
        });
    },
    onReachBottom() {
        this.loadMore();
    },
    async loadMore() {
        const data = this.data;
        if (data.loading)
            return;
        if (data.tab === "codes" && data.codesHasMore) {
            const next = data.codesPage + 1;
            this.setData({ loading: true });
            try {
                const r = await this.fetchPaged("listAuthCodes", {
                    page: next,
                    status: CODE_STATUS_VALUES[data.codeFilterIndex],
                });
                this.setData({
                    codes: data.codes.concat(r.list.map((x) => Object.assign({}, x, { timeText: fmtTime(x.used_time || x.create_time) }))),
                    codesPage: next,
                    codesHasMore: data.codes.length + r.list.length < r.total,
                    loading: false,
                });
            }
            catch (e) {
                this.setData({ loading: false });
            }
        }
        else if (data.tab === "teachers" && data.teachersHasMore) {
            const next = data.teachersPage + 1;
            this.setData({ loading: true });
            try {
                const r = await this.fetchPaged("listTeachers", { page: next });
                this.setData({
                    teachers: data.teachers.concat(r.list.map((x) => Object.assign({}, x, { timeText: fmtTime(x.create_time) }))),
                    teachersPage: next,
                    teachersHasMore: data.teachers.length + r.list.length < r.total,
                    loading: false,
                });
            }
            catch (e) {
                this.setData({ loading: false });
            }
        }
        else if (data.tab === "students" && data.studentsHasMore) {
            const next = data.studentsPage + 1;
            this.setData({ loading: true });
            try {
                const r = await this.fetchPaged("adminListStudents", {
                    page: next,
                    uid: data.sUid.trim(),
                    batchNo: data.sBatch.trim(),
                    status: STU_STATUS_VALUES[data.stuStatusIndex],
                });
                this.setData({
                    students: data.students.concat(r.list),
                    studentsPage: next,
                    studentsHasMore: data.students.length + r.list.length < r.total,
                    loading: false,
                });
            }
            catch (e) {
                this.setData({ loading: false });
            }
        }
    },
});
