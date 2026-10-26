"use strict";
/**
 * 切割编码管线编排器：VideoDecoder 定点取帧 → 离屏 Canvas 按格裁剪缩放 → CellGif 编码 → 落盘。
 *
 * 两遍结构：
 *   Pass 1 采样：均匀取 12 个时间点，为每格累积调色板采样像素；
 *   Pass 2 编码：按自适应帧率逐帧裁剪编码（总帧数 ≤ 300）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineAbort = void 0;
exports.runGifPipeline = runGifPipeline;
const gifencode_1 = require("./gifencode");
const videodecode_1 = require("./videodecode");
const gifencLib = require("../libs/gifenc.js");
void gifencLib; // 引用保持（实际使用在 gifencode.ts 内）
class PipelineAbort extends Error {
    constructor() {
        super("用户取消");
    }
}
exports.PipelineAbort = PipelineAbort;
function checkAbort(ref) {
    if (ref && ref.aborted)
        throw new PipelineAbort();
}
async function runGifPipeline(opts) {
    const { videoPath, videoWidth, videoHeight, durationSec, rects, cellMaxWidth, startTime = 0, endTime = 0, customFps, speedFactor = 1.0, onProgress, abortRef, } = opts;
    if (!rects.length)
        throw new Error("没有可切割的格子");
    const startSec = Math.max(0, startTime);
    const endSec = endTime > startSec ? Math.min(endTime, durationSec) : durationSec;
    const sourceSpanSec = Math.max(0.1, endSec - startSec);
    const startMs = startSec * 1000;
    const sourceSpanMs = sourceSpanSec * 1000;
    // 变速计算：导出时长 = 片段原始时长 / 播放倍速
    const speed = Math.max(0.2, Math.min(speedFactor || 1.0, 5.0));
    const outDurationSec = sourceSpanSec / speed;
    // ── 输出参数 ──────────────────────────────────────────────
    const fps = customFps && customFps >= 6 && customFps <= 24
        ? customFps
        : (0, gifencode_1.adaptiveFps)(outDurationSec);
    const frameCount = Math.max(1, Math.min(300, Math.ceil(outDurationSec * fps)));
    const delayMs = Math.round(1000 / fps);
    const cells = rects.map((rect, index) => {
        const outW = Math.max(2, Math.min(rect.w, cellMaxWidth));
        const outH = Math.max(2, Math.round((rect.h * outW) / rect.w));
        return {
            index,
            rect,
            outW,
            outH,
            gif: new gifencode_1.CellGif(outW, outH, delayMs),
        };
    });
    // ── 画布 ─────────────────────────────────────────────────
    const mainCanvas = wx.createOffscreenCanvas({
        type: "2d",
        width: videoWidth,
        height: videoHeight,
    });
    const mainCtx = mainCanvas.getContext("2d");
    const frameImage = mainCtx.createImageData(videoWidth, videoHeight);
    const cellCanvases = cells.map((c) => {
        const canvas = wx.createOffscreenCanvas({ type: "2d", width: c.outW, height: c.outH });
        return { canvas, ctx: canvas.getContext("2d") };
    });
    /** 把一帧画到主画布，再裁剪缩放到各格画布 */
    function layoutFrame(frameData) {
        frameImage.data.set(new Uint8Array(frameData));
        mainCtx.putImageData(frameImage, 0, 0);
        cells.forEach((c, i) => {
            const { ctx } = cellCanvases[i];
            ctx.clearRect(0, 0, c.outW, c.outH);
            // drawImage(源画布, sx, sy, sw, sh, dx, dy, dw, dh)
            ctx.drawImage(mainCanvas, c.rect.x, c.rect.y, c.rect.w, c.rect.h, 0, 0, c.outW, c.outH);
        });
    }
    // ── 清理旧产物 ────────────────────────────────────────────
    const fsm = wx.getFileSystemManager();
    const outDir = `${wx.env.USER_DATA_PATH}`;
    function cellPath(index) {
        return `${outDir}/grid-cell-${index}.gif`;
    }
    for (const c of cells) {
        try {
            fsm.unlinkSync(cellPath(c.index));
        }
        catch (_a) {
            /* 文件不存在，忽略 */
        }
    }
    const files = [];
    const decoder = await (0, videodecode_1.openDecoder)(videoPath);
    try {
        // ── Pass 1：调色板采样（12 个均匀时间点） ──────────────
        const SAMPLE_POINTS = 12;
        for (let i = 0; i < SAMPLE_POINTS; i++) {
            checkAbort(abortRef);
            const t = startMs + (sourceSpanMs * (i + 0.5)) / SAMPLE_POINTS;
            const frame = await decoder.frameAt(t);
            layoutFrame(frame.data);
            cells.forEach((c, ci) => {
                const img = cellCanvases[ci].ctx.getImageData(0, 0, c.outW, c.outH);
                c.gif.addSamplePixels(new Uint8Array(img.data.buffer));
            });
            onProgress === null || onProgress === void 0 ? void 0 : onProgress("palette", (i + 1) / SAMPLE_POINTS);
        }
        // ── 生成调色板 ──────────────────────────────────────────
        cells.forEach((c) => c.gif.buildPalette(256));
        // ── Pass 2：逐帧编码（按倍速均匀映射原视频时间轴） ──────
        for (let i = 0; i < frameCount; i++) {
            checkAbort(abortRef);
            const progressRatio = frameCount > 1 ? i / (frameCount - 1) : 0;
            const t = startMs + Math.min(sourceSpanMs * progressRatio, Math.max(0, sourceSpanMs - 40));
            const frame = await decoder.frameAt(Math.max(0, t));
            layoutFrame(frame.data);
            cells.forEach((c, ci) => {
                const img = cellCanvases[ci].ctx.getImageData(0, 0, c.outW, c.outH);
                c.gif.addFrame(new Uint8Array(img.data.buffer));
            });
            onProgress === null || onProgress === void 0 ? void 0 : onProgress("encode", (i + 1) / frameCount);
        }
        // ── 收尾落盘 ────────────────────────────────────────────
        for (const c of cells) {
            checkAbort(abortRef);
            const bytes = c.gif.finish();
            const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            const path = cellPath(c.index);
            fsm.writeFileSync(path, buf, "binary");
            files.push({ index: c.index, path, width: c.outW, height: c.outH, size: buf.byteLength });
        }
    }
    catch (err) {
        // 失败/取消时清理半成品
        for (const c of cells) {
            try {
                fsm.unlinkSync(cellPath(c.index));
            }
            catch (_b) {
                /* ignore */
            }
        }
        throw err;
    }
    finally {
        await decoder.close();
    }
    return { files, fps, frameCount };
}
