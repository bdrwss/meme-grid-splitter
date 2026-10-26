/**
 * 单格 GIF 构建器（纯逻辑，Node 可测）。
 *
 * 流程：累积采样像素 → quantize 生成调色板 → applyPalette 逐帧索引 → LZW 编码。
 * 调色板从多帧采样像素一次性生成（近似 Web 版 palettegen），全部帧共用，编码速度优先。
 */

const gifenc = require("../libs/gifenc.js");

/** 每格采样像素总量上限（控制调色板阶段的内存与耗时） */
const MAX_SAMPLES = 120000;

export class CellGif {
  readonly outWidth: number;
  readonly outHeight: number;
  readonly delayMs: number;

  private sampleBuf: Uint8Array;
  private sampleCount = 0;
  private palette: number[][] | null = null;
  private encoder: any;
  private frameCount = 0;

  constructor(outWidth: number, outHeight: number, delayMs: number) {
    this.outWidth = Math.max(2, Math.round(outWidth));
    this.outHeight = Math.max(2, Math.round(outHeight));
    this.delayMs = Math.max(20, Math.round(delayMs / 10) * 10);
    this.sampleBuf = new Uint8Array(MAX_SAMPLES * 4);
    this.encoder = gifenc.GIFEncoder({ initialCapacity: 1 << 20 });
  }

  /** 采样一帧（rgba 为 outWidth×outHeight 的 RGBA 数据；内部按步长抽样） */
  addSamplePixels(rgba: Uint8Array) {
    const total = this.outWidth * this.outHeight;
    const remain = MAX_SAMPLES - this.sampleCount;
    if (remain <= 0) return;
    const step = Math.max(1, Math.ceil(total / Math.min(remain, 16384)));
    for (let i = 0; i < total; i += step) {
      if (this.sampleCount >= MAX_SAMPLES) break;
      const src = i * 4;
      const dst = this.sampleCount * 4;
      this.sampleBuf[dst] = rgba[src];
      this.sampleBuf[dst + 1] = rgba[src + 1];
      this.sampleBuf[dst + 2] = rgba[src + 2];
      this.sampleBuf[dst + 3] = 255;
      this.sampleCount++;
    }
  }

  /** 用累计采样生成调色板（必须在 addFrame 之前调用一次） */
  buildPalette(maxColors = 256) {
    if (this.sampleCount === 0) {
      // 无采样时给一个安全灰阶调色板
      this.palette = [];
      for (let i = 0; i < 256; i++) this.palette.push([i, i, i]);
      return this.palette;
    }
    const data = this.sampleBuf.subarray(0, this.sampleCount * 4);
    this.palette = gifenc.quantize(data, maxColors, { format: "rgb565" });
    // 释放采样缓冲
    this.sampleBuf = new Uint8Array(0);
    return this.palette;
  }

  /** 加入一帧（rgba 为 outWidth×outHeight 的 RGBA 数据） */
  addFrame(rgba: Uint8Array) {
    if (!this.palette) throw new Error("must call buildPalette() first");
    const index = gifenc.applyPalette(rgba, this.palette, "rgb565");
    if (this.frameCount === 0) {
      this.encoder.writeFrame(index, this.outWidth, this.outHeight, {
        palette: this.palette,
        delay: this.delayMs,
        repeat: 0, // 无限循环（同 Web 版 -loop 0）
      });
    } else {
      this.encoder.writeFrame(index, this.outWidth, this.outHeight, {
        delay: this.delayMs,
      });
    }
    this.frameCount++;
  }

  get framesWritten() {
    return this.frameCount;
  }

  /** 完成编码，返回 GIF 文件字节 */
  finish(): Uint8Array {
    if (this.frameCount === 0) throw new Error("no frames added");
    this.encoder.finish();
    return this.encoder.bytes();
  }
}

/** 由视频时长自适应输出帧率：总帧数控制在预算内，短视频保 12fps */
export function adaptiveFps(durationSec: number, frameBudget = 300): number {
  if (!durationSec || durationSec <= 0) return 12;
  const fps = Math.round(frameBudget / durationSec);
  return Math.max(5, Math.min(12, fps));
}
