"use strict";
/**
 * 切割线几何计算 —— 从 Web 版 src/lib/geometry.ts 原样移植（纯函数，零平台依赖）。
 * 切割线以「百分比」存储（1~99），换算成像素后再按偶数向下取整，
 * 保证编码所需的偶数宽高，且每格最小 2 像素。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRID_PRESETS = exports.MAX_PERCENT = exports.MIN_PERCENT = exports.MAX_LINES = exports.DEFAULT_LINES = void 0;
exports.clamp = clamp;
exports.cellCount = cellCount;
exports.getEqualLines = getEqualLines;
exports.buildRects = buildRects;
exports.snapRect = snapRect;
exports.suggestNextLine = suggestNextLine;
exports.isPresetActive = isPresetActive;
/** 默认两条横线 / 两条竖线 —— 即 3×3 = 九宫格 */
exports.DEFAULT_LINES = [33.3, 66.7];
/** 每个方向最多 10 条切割线 */
exports.MAX_LINES = 10;
/** 百分比合法区间 */
exports.MIN_PERCENT = 1;
exports.MAX_PERCENT = 99;
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/** 格数 = (横线数 + 1) × (竖线数 + 1) */
function cellCount(hLines, vLines) {
    return (hLines + 1) * (vLines + 1);
}
/**
 * 均等重置切割线：根据指定的行数或列数（格数），计算各切割线均匀分布的百分比位置。
 * 例如 3 格产生 [33.3, 66.7]，2 格产生 [50.0]，1 格产生 []。
 */
function getEqualLines(count) {
    if (count <= 1)
        return [];
    return Array.from({ length: count - 1 }, (_, i) => Number((((i + 1) / count) * 100).toFixed(1)));
}
/**
 * 依据横线与竖线的百分比位置，把 width×height 的画面切成若干矩形。
 * 返回顺序为「自上而下、自左而右」。
 */
function buildRects(hLines, vLines, width, height) {
    const ys = [0, ...[...hLines].sort((a, b) => a - b).map((p) => (p / 100) * height), height];
    const xs = [0, ...[...vLines].sort((a, b) => a - b).map((p) => (p / 100) * width), width];
    const rects = [];
    for (let r = 0; r < ys.length - 1; r++) {
        for (let c = 0; c < xs.length - 1; c++) {
            rects.push({
                x: xs[c],
                y: ys[r],
                w: xs[c + 1] - xs[c],
                h: ys[r + 1] - ys[r],
            });
        }
    }
    return rects;
}
/** 像素对齐：坐标/宽高向下取偶数，宽高至少 2px */
function snapRect(rect) {
    return {
        x: Math.max(0, Math.round(rect.x) & -2),
        y: Math.max(0, Math.round(rect.y) & -2),
        w: Math.max(2, Math.round(rect.w) & -2),
        h: Math.max(2, Math.round(rect.h) & -2),
    };
}
/**
 * 自动补一条切割线：挑选当前最宽的相邻区间取中点。
 * 已满 MAX_LINES 时原样返回。
 */
function suggestNextLine(lines) {
    if (lines.length >= exports.MAX_LINES)
        return lines;
    const stops = [0, ...[...lines].sort((a, b) => a - b), 100];
    let widest = 0;
    let mid = 50;
    for (let i = 0; i < stops.length - 1; i++) {
        const gap = stops[i + 1] - stops[i];
        if (gap > widest) {
            widest = gap;
            mid = (stops[i] + stops[i + 1]) / 2;
        }
    }
    const next = clamp(Math.round(mid * 10) / 10, 1, 99);
    return [...lines, next];
}
/** 常见网格预设：2×2, 3×3, 3×1, 1×3 */
exports.GRID_PRESETS = [
    {
        id: "2x2",
        label: "2×2",
        hLines: [50],
        vLines: [50],
        name: "田字格",
        rows: 2,
        cols: 2,
        desc: "4 个独立表情包（2×2 等分）",
    },
    {
        id: "3x3",
        label: "3×3",
        hLines: [33.3, 66.7],
        vLines: [33.3, 66.7],
        name: "九宫格",
        rows: 3,
        cols: 3,
        desc: "9 个独立表情包（经典九宫格）",
    },
    {
        id: "3x1",
        label: "3×1",
        hLines: [],
        vLines: [33.3, 66.7],
        name: "横向三联",
        rows: 1,
        cols: 3,
        desc: "3 个独立表情包（横向排布）",
    },
    {
        id: "1x3",
        label: "1×3",
        hLines: [33.3, 66.7],
        vLines: [],
        name: "纵向三联",
        rows: 3,
        cols: 1,
        desc: "3 个独立表情包（纵向排布）",
    },
];
function matchesPresetLines(lines, target) {
    if (lines.length !== target.length)
        return false;
    const s1 = [...lines].sort((a, b) => a - b);
    const s2 = [...target].sort((a, b) => a - b);
    return s1.every((v, i) => Math.abs(v - s2[i]) < 0.2);
}
/** 判断当前切割线是否匹配指定预设 */
function isPresetActive(preset, hLines, vLines) {
    return matchesPresetLines(hLines, preset.hLines) && matchesPresetLines(vLines, preset.vLines);
}
