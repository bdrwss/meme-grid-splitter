"use strict";
/**
 * 工具目录与客户端搜索（零后端：目录随代码打包，后续新工具只需在此追加）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOLS = void 0;
exports.searchTools = searchTools;
exports.TOOLS = [
    {
        key: "grid-split",
        name: "九宫格视频切割",
        subtitle: "把多宫格视频拆成一个个独立表情包（GIF）",
        keywords: ["九宫格", "宫格", "切割", "切视频", "表情包", "动图", "gif", "grid", "split"],
        path: "/pages/splitter/index",
        needActivation: true,
        icon: "宫",
        enabled: true,
    },
];
/** 客户端搜索：按名称 / 副标题 / 关键词过滤 */
function searchTools(query) {
    const q = (query || "").trim().toLowerCase();
    const pool = exports.TOOLS.filter((t) => t.enabled);
    if (!q)
        return pool;
    return pool.filter((t) => {
        const haystack = [t.name, t.subtitle, ...t.keywords].join(" ").toLowerCase();
        return haystack.includes(q);
    });
}
