import {
  DEFAULT_LINES,
  GRID_PRESETS,
  MAX_LINES,
  buildRects,
  cellCount,
  clamp,
  getEqualLines,
  isPresetActive,
  snapRect,
  suggestNextLine,
  GridPreset,
} from "../../utils/geometry";
import { getBinding, isBindingActive } from "../../utils/storage";
import { cloudEnabled, getSession, sessionCanUseTools } from "../../utils/api";
import {
  PipelineAbort,
  runGifPipeline,
  CellOutput,
} from "../../utils/gifpipe";
import { adaptiveFps } from "../../utils/gifencode";
import {
  formatBytes,
  formatTime,
  getAspectRatioLabel,
  sanitizePrefix,
  sanitizeSuffix,
} from "../../utils/utils";

const JSZip = require("../../libs/jszip.js");

interface VideoInfo {
  path: string;
  width: number;
  height: number;
  duration: number;
  size: number;
  sizeText: string;
  aspectRatio: string;
  name: string;
}

interface ResultView extends CellOutput {
  sizeText: string;
}

interface LineItemView {
  index: number;
  order: number;
  pct: number;
  displayValue: number;
}

interface SplitterData {
  video: VideoInfo | null;
  sampleLoading: boolean;
  previewHeight: number;
  hLines: number[];
  vLines: number[];
  hLineViews: LineItemView[];
  vLineViews: LineItemView[];
  unit: "percent" | "pixel";
  showLines: boolean;
  showLabels: boolean;
  presets: typeof GRID_PRESETS;
  activePreset: string;
  activePresetName: string;
  cellTotal: number;
  quality: number;
  qualityOptions: { w: number; label: string }[];
  gifFps: number;
  speedFactor: number;
  speedOptions: number[];
  speedDescText: string;
  startTime: number;
  endTime: number;
  currentVideoTime: number;
  currentVideoTimeText: string;
  videoDurationText: string;
  isPlaying: boolean;
  isLoop: boolean;
  estimateText: string;
  processing: { active: boolean; ratioPercent: number; text: string };
  results: ResultView[] | null;
  resultsMeta: { fps: number; frameCount: number };
  historyOpen: boolean;
  prefix: string;
  suffix: string;
  fileNamePreview: string;
  selectedIndices: number[];
  confirmReplaceOpen: boolean;
  packingZip: boolean;
}

const DRAG_THRESHOLD_PX = 24;

Page({
  data: {
    video: null,
    sampleLoading: false,
    previewHeight: 320,
    hLines: DEFAULT_LINES.slice(),
    vLines: DEFAULT_LINES.slice(),
    hLineViews: [],
    vLineViews: [],
    unit: "percent",
    showLines: true,
    showLabels: true,
    presets: GRID_PRESETS,
    activePreset: "3x3",
    activePresetName: "九宫格 · 9 个独立表情包（经典九宫格）",
    cellTotal: 9,
    quality: 320,
    qualityOptions: [
      { w: 240, label: "流畅" },
      { w: 320, label: "标准" },
      { w: 480, label: "高清" },
    ],
    gifFps: 12,
    speedFactor: 1.0,
    speedOptions: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0],
    speedDescText: "原速播放 (1.0x)",
    startTime: 0,
    endTime: 0,
    currentVideoTime: 0,
    currentVideoTimeText: "00:00",
    videoDurationText: "00:00",
    isPlaying: true,
    isLoop: true,
    estimateText: "",
    processing: { active: false, ratioPercent: 0, text: "" },
    results: null,
    resultsMeta: { fps: 0, frameCount: 0 },
    historyOpen: false,
    prefix: "表情包",
    suffix: "",
    fileNamePreview: "表情包_1.gif",
    selectedIndices: [],
    confirmReplaceOpen: false,
    packingZip: false,
  } as SplitterData,

  ctx: null as any,
  videoCtx: null as any,
  canvasSize: { w: 0, h: 0 },
  dragTarget: null as null | { axis: "h" | "v"; index: number },
  abortRef: { aborted: false },
  submitting: false,

  onLoad(this: any) {
    console.log("[Splitter] build 20261026-pro（全功能对齐版）");
    if (cloudEnabled) {
      const s = getSession();
      if (!sessionCanUseTools(s)) {
        wx.showToast({ title: "请先绑定身份", icon: "none" });
        setTimeout(() => wx.redirectTo({ url: "/pages/rolebind/index" }), 600);
      }
      return;
    }
    if (!isBindingActive(getBinding())) {
      wx.showToast({ title: "请先激活", icon: "none" });
      setTimeout(() => wx.redirectTo({ url: "/pages/bind/index" }), 600);
    }
  },

  onReady(this: any) {
    this.videoCtx = wx.createVideoContext("previewVideo", this);
  },

  onUnload(this: any) {
    this.abortRef.aborted = true;
    this.submitting = false;
  },

  /** 快速体验：加载内置九宫格示例视频 */
  loadSample(this: any) {
    const data = this.data as SplitterData;
    if (data.processing.active) {
      this.setData({ confirmReplaceOpen: true });
      return;
    }
    this.setData({ sampleLoading: true });

    try {
      const fsm = wx.getFileSystemManager();
      const sampleDest = `${wx.env.USER_DATA_PATH}/sample-meme.mp4`;

      // 复制内置示例视频到用户沙箱目录，便于 VideoDecoder 和组件稳定读取
      try {
        fsm.copyFileSync("images/sample-meme.mp4", sampleDest);
      } catch (e) {
        console.warn("copyFileSync sample failed, try direct path", e);
      }

      const samplePath = sampleDest;
      const sys = wx.getSystemInfoSync();
      const stageW = sys.windowWidth - 24;
      const stageH = Math.round(stageW * 1.0); // 480x480 正方形 1:1

      this.setData({
        video: {
          path: samplePath,
          width: 480,
          height: 480,
          duration: 2.0,
          size: 206955,
          sizeText: formatBytes(206955),
          aspectRatio: "1:1",
          name: "示例九宫格.mp4",
        },
        previewHeight: Math.min(stageH, Math.round(sys.windowHeight * 0.6)),
        startTime: 0,
        endTime: 2.0,
        currentVideoTime: 0,
        currentVideoTimeText: "00:00",
        videoDurationText: "00:02",
        results: null,
        selectedIndices: [],
        sampleLoading: false,
      } as Partial<SplitterData>);

      this.syncDerived();
      setTimeout(() => this.initCanvas(), 180);
      wx.showToast({ title: "已加载示例视频", icon: "success" });
    } catch (err: any) {
      console.error("加载示例视频失败", err);
      this.setData({ sampleLoading: false });
      wx.showToast({ title: "加载示例失败，请选择本地视频", icon: "none" });
    }
  },

  /** 选择本地视频 */
  chooseVideo(this: any) {
    const data = this.data as SplitterData;
    if (data.processing.active) {
      this.setData({ confirmReplaceOpen: true });
      return;
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ["video"],
      sourceType: ["album", "camera"],
      maxDuration: 60,
      sizeType: ["compressed"],
      success: (res: any) => {
        const f = res.tempFiles[0];
        if (!f || !f.width || !f.height) {
          wx.showToast({ title: "无法读取视频信息", icon: "none" });
          return;
        }
        const dur = Number((f.duration || 0).toFixed(2));
        if (dur > 61) {
          wx.showToast({ title: "请选择 60 秒以内的视频", icon: "none" });
          return;
        }
        const sys = wx.getSystemInfoSync();
        const stageW = sys.windowWidth - 24;
        const stageH = Math.round((stageW * f.height) / f.width);

        const fileName = (f.tempFilePath || "").split("/").pop() || "视频.mp4";

        this.setData({
          video: {
            path: f.tempFilePath,
            width: f.width,
            height: f.height,
            duration: dur,
            size: f.size,
            sizeText: formatBytes(f.size),
            aspectRatio: getAspectRatioLabel(f.width, f.height),
            name: fileName,
          },
          previewHeight: Math.min(stageH, Math.round(sys.windowHeight * 0.6)),
          startTime: 0,
          endTime: dur,
          currentVideoTime: 0,
          currentVideoTimeText: "00:00",
          videoDurationText: formatTime(dur),
          results: null,
          selectedIndices: [],
        } as Partial<SplitterData>);

        this.syncDerived();
        setTimeout(() => this.initCanvas(), 180);
      },
    });
  },

  /** 确认中断当前切割并更换视频 */
  confirmReplace(this: any) {
    this.abortRef.aborted = true;
    this.setData({
      confirmReplaceOpen: false,
      processing: { active: false, ratioPercent: 0, text: "" },
    });
    this.chooseVideo();
  },

  closeConfirmReplace(this: any) {
    this.setData({ confirmReplaceOpen: false });
  },

  /** 初始化切割线与标号绘制画布 */
  initCanvas(this: any) {
    const query = wx.createSelectorQuery();
    query.select("#grid").fields({ node: true, size: true });
    query.exec((res: any) => {
      const item = res && res[0];
      if (!item || !item.node) return;
      const canvas = item.node;
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      canvas.width = Math.round(item.width * dpr);
      canvas.height = Math.round(item.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      this.ctx = ctx;
      this.canvasSize = { w: item.width, h: item.height };
      this.draw();
    });
  },

  /** 绘制参考线、标签与序号标识角标 */
  draw(this: any) {
    const ctx = this.ctx;
    if (!ctx) return;
    const data = this.data as SplitterData;
    const { w, h } = this.canvasSize;
    ctx.clearRect(0, 0, w, h);

    if (!data.video) return;

    // 1. 绘制网格单元格序号标识（若启用）
    if (data.showLabels) {
      const sortedH = [0, ...[...data.hLines].sort((a, b) => a - b), 100];
      const sortedV = [0, ...[...data.vLines].sort((a, b) => a - b), 100];
      let cellOrder = 1;

      for (let r = 0; r < sortedH.length - 1; r++) {
        for (let c = 0; c < sortedV.length - 1; c++) {
          const top = (sortedH[r] / 100) * h;
          const bottom = (sortedH[r + 1] / 100) * h;
          const left = (sortedV[c] / 100) * w;
          const right = (sortedV[c + 1] / 100) * w;
          const cellW = right - left;
          const cellH = bottom - top;

          // 在单元格中心绘制半透明序号角标
          const badgeSize = Math.min(26, Math.max(18, Math.min(cellW, cellH) * 0.28));
          const badgeX = left + cellW / 2;
          const badgeY = top + cellH / 2;

          ctx.save();
          ctx.beginPath();
          ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${Math.round(badgeSize * 0.58)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(cellOrder), badgeX, badgeY);
          ctx.restore();

          cellOrder++;
        }
      }
    }

    // 2. 绘制切割线（若开启显示）
    if (data.showLines) {
      // 水平横线（粉色）
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);

      for (const p of data.hLines) {
        const y = (p / 100) * h;
        ctx.strokeStyle = "rgba(244, 63, 94, 0.95)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 垂直竖线（蓝色）
      for (const p of data.vLines) {
        const x = (p / 100) * w;
        ctx.strokeStyle = "rgba(59, 130, 246, 0.95)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      ctx.setLineDash([]);

      // 3. 绘制线上的百分比/像素提示标签
      const tagH = 18;
      const pad = 4;
      ctx.font = "10px sans-serif";

      for (const p of data.hLines) {
        const valText =
          data.unit === "percent"
            ? `${p.toFixed(1)}%`
            : `${Math.round((p / 100) * data.video.height)}px`;
        const tw = ctx.measureText(valText).width;
        const y = (p / 100) * h;
        ctx.fillStyle = "rgba(244, 63, 94, 0.85)";
        ctx.fillRect(pad, Math.max(0, y - tagH - pad), tw + pad * 2, tagH);
        ctx.fillStyle = "#fff";
        ctx.fillText(valText, pad + pad, Math.max(tagH - pad / 2 - 1, y - pad - 1));
      }

      for (const p of data.vLines) {
        const valText =
          data.unit === "percent"
            ? `${p.toFixed(1)}%`
            : `${Math.round((p / 100) * data.video.width)}px`;
        const tw = ctx.measureText(valText).width;
        const x = (p / 100) * w;
        ctx.fillStyle = "rgba(59, 130, 246, 0.85)";
        ctx.fillRect(Math.min(x + pad, w - tw - pad * 2 - pad), pad, tw + pad * 2, tagH);
        ctx.fillStyle = "#fff";
        ctx.fillText(valText, Math.min(x + pad + pad, w - tw - pad), pad + tagH - pad / 2 - 1);
      }
    }
  },

  /** 触摸拖拽切割线 */
  onTouchStart(this: any, e: any) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    const data = this.data as SplitterData;
    const { w, h } = this.canvasSize;
    let best: { axis: "h" | "v"; index: number } | null = null;
    let bestDist = DRAG_THRESHOLD_PX;

    data.hLines.forEach((p, i) => {
      const d = Math.abs(t.y - (p / 100) * h);
      if (d < bestDist) {
        bestDist = d;
        best = { axis: "h", index: i };
      }
    });

    data.vLines.forEach((p, i) => {
      const d = Math.abs(t.x - (p / 100) * w);
      if (d < bestDist) {
        bestDist = d;
        best = { axis: "v", index: i };
      }
    });

    this.dragTarget = best;
  },

  onTouchMove(this: any, e: any) {
    const t = e.touches && e.touches[0];
    const target = this.dragTarget;
    if (!t || !target) return;
    const { w, h } = this.canvasSize;
    const pct = clamp(
      Math.round(((target.axis === "h" ? t.y / h : t.x / w) * 100) * 10) / 10,
      1,
      99,
    );
    const key = target.axis === "h" ? "hLines" : "vLines";
    const lines = ((this.data as SplitterData)[key] as number[]).slice();
    lines[target.index] = pct;
    this.setData({ [key]: lines } as any);
    this.syncDerived();
    this.draw();
  },

  onTouchEnd(this: any) {
    this.dragTarget = null;
  },

  /** 工具栏：显示/隐藏切割线 */
  toggleLines(this: any) {
    const next = !this.data.showLines;
    this.setData({ showLines: next });
    this.draw();
    wx.showToast({ title: next ? "已显示切割线" : "已隐藏切割线", icon: "none" });
  },

  /** 工具栏：序号标识开关 */
  toggleLabels(this: any) {
    const next = !this.data.showLabels;
    this.setData({ showLabels: next });
    this.draw();
    wx.showToast({ title: next ? "已开启序号标识" : "已关闭序号标识", icon: "none" });
  },

  /** 工具栏：均等重置网格 */
  resetGrid(this: any) {
    const data = this.data as SplitterData;
    const rows = data.hLines.length + 1;
    const cols = data.vLines.length + 1;
    this.setData({
      hLines: getEqualLines(rows),
      vLines: getEqualLines(cols),
    });
    this.syncDerived();
    this.draw();
    wx.showToast({ title: "网格已恢复为均匀分布", icon: "success" });
  },

  /** 网格预设切换 */
  onPresetTap(this: any, e: any) {
    const id = e.currentTarget.dataset.id as string;
    const preset = GRID_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.setData({
      hLines: preset.hLines.slice(),
      vLines: preset.vLines.slice(),
    } as Partial<SplitterData>);
    this.syncDerived();
    this.draw();
  },

  /** 位置单位切换（百分比 % 与像素 px） */
  onUnitChange(this: any, e: any) {
    const unit = e.currentTarget.dataset.unit as "percent" | "pixel";
    this.setData({ unit });
    this.syncDerived();
    this.draw();
  },

  /** 增加/减少切割线 */
  addHLine(this: any) {
    const lines = ((this.data as SplitterData).hLines as number[]).slice();
    if (lines.length >= MAX_LINES) {
      wx.showToast({ title: `水平线最多 ${MAX_LINES} 条`, icon: "none" });
      return;
    }
    this.setData({ hLines: suggestNextLine(lines) } as Partial<SplitterData>);
    this.syncDerived();
    this.draw();
  },

  removeHLine(this: any) {
    const lines = ((this.data as SplitterData).hLines as number[]).slice();
    if (lines.length === 0) return;
    lines.sort((a, b) => a - b).pop();
    this.setData({ hLines: lines } as Partial<SplitterData>);
    this.syncDerived();
    this.draw();
  },

  addVLine(this: any) {
    const lines = ((this.data as SplitterData).vLines as number[]).slice();
    if (lines.length >= MAX_LINES) {
      wx.showToast({ title: `垂直线最多 ${MAX_LINES} 条`, icon: "none" });
      return;
    }
    this.setData({ vLines: suggestNextLine(lines) } as Partial<SplitterData>);
    this.syncDerived();
    this.draw();
  },

  removeVLine(this: any) {
    const lines = ((this.data as SplitterData).vLines as number[]).slice();
    if (lines.length === 0) return;
    lines.sort((a, b) => a - b).pop();
    this.setData({ vLines: lines } as Partial<SplitterData>);
    this.syncDerived();
    this.draw();
  },

  /** 切割线逐条数值输入修改 */
  onHLineBlur(this: any, e: any) {
    const idx = Number(e.currentTarget.dataset.index);
    const raw = parseFloat(e.detail.value);
    if (isNaN(raw)) return;
    const data = this.data as SplitterData;
    const maxVal = data.video ? data.video.height : 100;
    const nextPct = data.unit === "percent" ? raw : (raw / maxVal) * 100;
    const clamped = clamp(Number(nextPct.toFixed(1)), 1, 99);
    const lines = data.hLines.slice();
    lines[idx] = clamped;
    this.setData({ hLines: lines });
    this.syncDerived();
    this.draw();
  },

  onVLineBlur(this: any, e: any) {
    const idx = Number(e.currentTarget.dataset.index);
    const raw = parseFloat(e.detail.value);
    if (isNaN(raw)) return;
    const data = this.data as SplitterData;
    const maxVal = data.video ? data.video.width : 100;
    const nextPct = data.unit === "percent" ? raw : (raw / maxVal) * 100;
    const clamped = clamp(Number(nextPct.toFixed(1)), 1, 99);
    const lines = data.vLines.slice();
    lines[idx] = clamped;
    this.setData({ vLines: lines });
    this.syncDerived();
    this.draw();
  },

  /** 删除单条切割线 */
  onDeleteHLine(this: any, e: any) {
    const idx = Number(e.currentTarget.dataset.index);
    const lines = (this.data as SplitterData).hLines.filter((_, i) => i !== idx);
    this.setData({ hLines: lines });
    this.syncDerived();
    this.draw();
  },

  onDeleteVLine(this: any, e: any) {
    const idx = Number(e.currentTarget.dataset.index);
    const lines = (this.data as SplitterData).vLines.filter((_, i) => i !== idx);
    this.setData({ vLines: lines });
    this.syncDerived();
    this.draw();
  },

  /** 画质与抽帧率 */
  onQualityTap(this: any, e: any) {
    this.setData({ quality: Number(e.currentTarget.dataset.w) } as Partial<SplitterData>);
    this.syncDerived();
  },

  onGifFpsChange(this: any, e: any) {
    this.setData({ gifFps: Number(e.detail.value) });
    this.syncDerived();
  },

  /** 播放倍速切换（0.5x ~ 3.0x） */
  onSpeedTap(this: any, e: any) {
    const val = Number(e.currentTarget.dataset.val);
    this.setData({ speedFactor: val });
    if (this.videoCtx && this.videoCtx.playbackRate) {
      try {
        this.videoCtx.playbackRate(val);
      } catch (err) {
        /* ignore if device doesn't support specific rate */
      }
    }
    this.syncDerived();
    wx.showToast({ title: val === 1.0 ? "已恢复原速" : `已设置 ${val}x 变速`, icon: "none" });
  },

  /** 时间范围截取 */
  onStartTimeBlur(this: any, e: any) {
    const val = parseFloat(e.detail.value);
    const next = isNaN(val) ? 0 : Math.max(0, Number(val.toFixed(2)));
    this.setData({ startTime: next });
    this.syncDerived();
  },

  onEndTimeBlur(this: any, e: any) {
    const data = this.data as SplitterData;
    const val = parseFloat(e.detail.value);
    const maxDur = data.video ? data.video.duration : 0;
    const next = isNaN(val) || val <= 0 ? maxDur : Math.min(maxDur, Math.max(0, Number(val.toFixed(2))));
    this.setData({ endTime: next });
    this.syncDerived();
  },

  /** 一键取当前播放帧作为起始时间 */
  handlePickCurrentFrame(this: any) {
    const data = this.data as SplitterData;
    const clamped = Math.max(0, Number(data.currentVideoTime.toFixed(2)));
    this.setData({ startTime: clamped });
    this.syncDerived();
    wx.showToast({ title: `已将当前帧 (${clamped}s) 设为起始`, icon: "success" });
  },

  /** 播放器控制 */
  togglePlay(this: any) {
    const data = this.data as SplitterData;
    if (!this.videoCtx) {
      this.videoCtx = wx.createVideoContext("previewVideo", this);
    }
    if (data.isPlaying) {
      this.videoCtx.pause();
      this.setData({ isPlaying: false });
    } else {
      this.videoCtx.play();
      this.setData({ isPlaying: true });
    }
  },

  toggleLoop(this: any) {
    const next = !this.data.isLoop;
    this.setData({ isLoop: next });
    wx.showToast({ title: next ? "循环播放开启" : "循环播放关闭", icon: "none" });
  },

  onTimeUpdate(this: any, e: any) {
    const ct = Number(e.detail.currentTime || 0);
    this.setData({
      currentVideoTime: ct,
      currentVideoTimeText: formatTime(ct),
    });
  },

  onSeekChange(this: any, e: any) {
    const val = Number(e.detail.value);
    if (!this.videoCtx) {
      this.videoCtx = wx.createVideoContext("previewVideo", this);
    }
    this.videoCtx.seek(val);
    this.setData({
      currentVideoTime: val,
      currentVideoTimeText: formatTime(val),
    });
  },

  /** 同步派生数据（预设匹配、输入列表、预估文案、文件名预览） */
  syncDerived(this: any) {
    const data = this.data as SplitterData;
    if (!data.video) return;

    const matched = GRID_PRESETS.find(
      (p) =>
        isPresetActive(p, data.hLines, data.vLines) &&
        p.hLines.length === data.hLines.length &&
        p.vLines.length === data.vLines.length,
    );

    const rects = buildRects(data.hLines, data.vLines, data.video.width, data.video.height);
    const sourceSpan = Math.max(0.1, (data.endTime > 0 ? data.endTime : data.video.duration) - data.startTime);
    const speed = data.speedFactor || 1.0;
    const outDur = sourceSpan / speed;
    const fps = data.gifFps || adaptiveFps(outDur);
    const frames = Math.min(300, Math.max(1, Math.ceil(outDur * fps)));
    const outW = Math.min(rects[0].w, data.quality);
    const estimate = `每格约 ${outW}×${Math.round((rects[0].h * outW) / rects[0].w)} · 导出 ${outDur.toFixed(1)}s · ${fps}fps · ${frames} 帧`;
    const speedDesc = speed === 1.0
      ? `原速播放，导出时长与截取片段一致 (${sourceSpan.toFixed(1)}s)`
      : `截取片段 ${sourceSpan.toFixed(1)}s @ ${speed}x ${speed > 1.0 ? "加速" : "慢放"} → 导出时长 ${outDur.toFixed(1)}s`;

    // 格式化切割线输入展示行
    const sortedHIndexes = data.hLines.map((_, i) => i).sort((a, b) => data.hLines[a] - data.hLines[b]);
    const hLineViews: LineItemView[] = sortedHIndexes.map((origIdx, order) => {
      const pct = data.hLines[origIdx];
      const displayValue = data.unit === "percent" ? pct : Math.round((pct / 100) * data.video!.height);
      return { index: origIdx, order: order + 1, pct, displayValue };
    });

    const sortedVIndexes = data.vLines.map((_, i) => i).sort((a, b) => data.vLines[a] - data.vLines[b]);
    const vLineViews: LineItemView[] = sortedVIndexes.map((origIdx, order) => {
      const pct = data.vLines[origIdx];
      const displayValue = data.unit === "percent" ? pct : Math.round((pct / 100) * data.video!.width);
      return { index: origIdx, order: order + 1, pct, displayValue };
    });

    const safeP = sanitizePrefix(data.prefix);
    const safeS = sanitizeSuffix(data.suffix);

    this.setData({
      cellTotal: cellCount(data.hLines.length, data.vLines.length),
      activePreset: matched ? matched.id : "",
      activePresetName: matched
        ? `${matched.name} · ${matched.desc}`
        : "自定义切割 · " + cellCount(data.hLines.length, data.vLines.length) + " 格",
      estimateText: estimate,
      speedDescText: speedDesc,
      hLineViews,
      vLineViews,
      fileNamePreview: `${safeP}_1${safeS}.gif`,
    } as Partial<SplitterData>);
  },

  /** 开始执行切割 */
  async onSubmit(this: any) {
    const data = this.data as SplitterData;
    if (!data.video || data.processing.active || this.submitting) return;

    if (data.endTime > 0 && data.startTime >= data.endTime) {
      wx.showToast({ title: "起始时间不能大于或等于结束时间", icon: "none" });
      return;
    }

    const rects = buildRects(
      data.hLines,
      data.vLines,
      data.video.width,
      data.video.height,
    ).map((r) => snapRect(r));

    if (rects.some((r) => r.w < 2 || r.h < 2)) {
      wx.showToast({ title: "存在过小格子，请调整切割线", icon: "none" });
      return;
    }

    this.submitting = true;
    this.abortRef = { aborted: false };
    this.setData({
      processing: { active: true, ratioPercent: 0, text: "正在分析画面取色板…" },
    } as Partial<SplitterData>);

    const startedAt = Date.now();
    try {
      const result = await runGifPipeline({
        videoPath: data.video.path,
        videoWidth: data.video.width,
        videoHeight: data.video.height,
        durationSec: data.video.duration,
        rects,
        cellMaxWidth: data.quality,
        startTime: data.startTime,
        endTime: data.endTime > 0 ? data.endTime : undefined,
        customFps: data.gifFps,
        speedFactor: data.speedFactor,
        abortRef: this.abortRef,
        onProgress: (phase: string, ratio: number) => {
          const pct = Math.max(1, Math.round(ratio * 100));
          const text = phase === "palette" ? "正在分析画面取色板…" : "正在逐帧裁剪编码…";
          this.setData({
            "processing.ratioPercent": pct,
            "processing.text": text,
          } as any);
        },
      });

      const secs = Math.round((Date.now() - startedAt) / 1000);
      const resultsView: ResultView[] = result.files.map((f) => ({
        ...f,
        sizeText: formatBytes(f.size),
      }));

      this.setData({
        processing: { active: false, ratioPercent: 100, text: "" },
        results: resultsView,
        resultsMeta: { fps: result.fps, frameCount: result.frameCount },
        historyOpen: true,
        selectedIndices: resultsView.map((r) => r.index),
      } as Partial<SplitterData>);

      wx.showToast({ title: `切割完成，共 ${resultsView.length} 个表情包`, icon: "success" });
      this.submitting = false;
    } catch (err: any) {
      console.error("[Splitter Pipeline Error]", err);
      this.setData({
        processing: { active: false, ratioPercent: 0, text: "" },
      } as Partial<SplitterData>);
      if (err instanceof PipelineAbort || err?.message === "用户取消") {
        wx.showToast({ title: "已取消切割", icon: "none" });
      } else {
        wx.showModal({
          title: "切割失败",
          content: err?.message || "请重试或减少切割格数",
          showCancel: false,
        });
      }
      this.submitting = false;
    }
  },

  /** 取消当前正在进行的切割 */
  onCancelProcessing(this: any) {
    this.abortRef.aborted = true;
    this.submitting = false;
    this.setData({
      processing: { active: false, ratioPercent: 0, text: "" },
    });
    wx.showToast({ title: "已取消切割", icon: "none" });
  },

  /** 弹窗历史结果管理 */
  openHistory(this: any) {
    const data = this.data as SplitterData;
    if (!data.results || data.results.length === 0) {
      wx.showToast({ title: "暂无历史结果，请先开始切割", icon: "none" });
      return;
    }
    this.setData({ historyOpen: true });
  },

  closeHistory(this: any) {
    this.setData({ historyOpen: false });
  },

  /** 自定义前缀与后缀输入 */
  onPrefixInput(this: any, e: any) {
    const prefix = e.detail.value;
    const safeP = sanitizePrefix(prefix);
    const safeS = sanitizeSuffix(this.data.suffix);
    this.setData({
      prefix,
      fileNamePreview: `${safeP}_1${safeS}.gif`,
    });
  },

  onSuffixInput(this: any, e: any) {
    const suffix = e.detail.value;
    const safeP = sanitizePrefix(this.data.prefix);
    const safeS = sanitizeSuffix(suffix);
    this.setData({
      suffix,
      fileNamePreview: `${safeP}_1${safeS}.gif`,
    });
  },

  /** 结果多选选择 */
  onToggleSelectItem(this: any, e: any) {
    const idx = Number(e.currentTarget.dataset.index);
    const selected: number[] = (this.data as SplitterData).selectedIndices.slice();
    const pos = selected.indexOf(idx);
    if (pos >= 0) {
      selected.splice(pos, 1);
    } else {
      selected.push(idx);
    }
    this.setData({ selectedIndices: selected });
  },

  onToggleSelectAll(this: any) {
    const data = this.data as SplitterData;
    const total = (data.results || []).length;
    if (data.selectedIndices.length === total) {
      this.setData({ selectedIndices: [] });
    } else {
      this.setData({ selectedIndices: (data.results || []).map((r) => r.index) });
    }
  },

  /** 单个保存 */
  onSaveOne(this: any, e: any) {
    const idx = Number(e.currentTarget.dataset.index);
    const data = this.data as SplitterData;
    const file = (data.results || []).find((r) => r.index === idx);
    if (!file) return;
    const safeP = sanitizePrefix(data.prefix);
    const safeS = sanitizeSuffix(data.suffix);
    this.saveFile(file.path, `${safeP}_${idx + 1}${safeS}.gif`);
  },

  /** 批量保存所选 */
  onSaveSelected(this: any) {
    const data = this.data as SplitterData;
    const results = (data.results || []).filter((r) => data.selectedIndices.includes(r.index));
    if (!results.length) {
      wx.showToast({ title: "请先勾选需要保存的表情包", icon: "none" });
      return;
    }
    this.batchSaveFiles(results);
  },

  /** 保存全部 */
  onSaveAll(this: any) {
    const data = this.data as SplitterData;
    const results = data.results || [];
    if (!results.length) return;
    this.batchSaveFiles(results);
  },

  batchSaveFiles(this: any, items: ResultView[]) {
    const data = this.data as SplitterData;
    const safeP = sanitizePrefix(data.prefix);
    const safeS = sanitizeSuffix(data.suffix);
    wx.showLoading({ title: `保存中 0/${items.length}`, mask: true });
    let done = 0;
    const next = () => {
      if (done >= items.length) {
        wx.hideLoading();
        wx.showToast({ title: "全部已保存到相册", icon: "success" });
        return;
      }
      const item = items[done];
      this.saveFile(item.path, `${safeP}_${item.index + 1}${safeS}.gif`, { silent: true });
      done++;
      wx.showLoading({ title: `保存中 ${done}/${items.length}`, mask: true });
      setTimeout(next, 300);
    };
    next();
  },

  /** 保存 GIF 到相册；失败时引导通过微信发送保留动图原文件 */
  saveFile(this: any, path: string, fileName: string, opts?: { silent?: boolean }) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => {
        if (!opts || !opts.silent) wx.showToast({ title: "已保存到相册", icon: "success" });
      },
      fail: () => {
        wx.showModal({
          title: "相册保存受限",
          content: "可直接把 GIF 表情发送到微信聊天（文件传输助手）即刻使用，是否发送？",
          confirmText: "发送",
          success: (r: any) => {
            if (!r.confirm) return;
            wx.shareFileMessage({
              filePath: path,
              fileName,
              fail: () => wx.showToast({ title: "发送取消", icon: "none" }),
            });
          },
        });
      },
    });
  },

  /** 打包导出 ZIP 压缩包并一键分享发送 */
  async onExportZip(this: any) {
    const data = this.data as SplitterData;
    const targetResults = (data.results || []).filter((r) =>
      data.selectedIndices.length > 0 ? data.selectedIndices.includes(r.index) : true,
    );

    if (!targetResults.length) {
      wx.showToast({ title: "没有可打包的切片", icon: "none" });
      return;
    }

    this.setData({ packingZip: true });
    wx.showLoading({ title: "正在打包 ZIP…", mask: true });

    try {
      const fsm = wx.getFileSystemManager();
      const zip = new JSZip();
      const safeP = sanitizePrefix(data.prefix);
      const safeS = sanitizeSuffix(data.suffix);

      for (const item of targetResults) {
        const fileData = fsm.readFileSync(item.path);
        const fileName = `${safeP}_${item.index + 1}${safeS}.gif`;
        zip.file(fileName, fileData);
      }

      const zipBuf = await zip.generateAsync({ type: "arraybuffer" });
      const zipFileName = `${safeP}_表情包${safeS}.zip`;
      const zipPath = `${wx.env.USER_DATA_PATH}/${zipFileName}`;

      fsm.writeFileSync(zipPath, zipBuf, "binary");
      wx.hideLoading();
      this.setData({ packingZip: false });

      wx.showModal({
        title: "ZIP 打包就绪",
        content: `已成功将 ${targetResults.length} 个表情包打包为 ${zipFileName}，点击发送可转发给好友或「文件传输助手」在电脑解压。`,
        confirmText: "立即发送",
        success: (r: any) => {
          if (!r.confirm) return;
          wx.shareFileMessage({
            filePath: zipPath,
            fileName: zipFileName,
            success: () => wx.showToast({ title: "已唤起发送", icon: "success" }),
            fail: (err: any) => {
              console.log("shareFileMessage fail", err);
              wx.showToast({ title: "发送取消", icon: "none" });
            },
          });
        },
      });
    } catch (err: any) {
      console.error("ZIP 打包失败", err);
      wx.hideLoading();
      this.setData({ packingZip: false });
      wx.showToast({ title: "打包失败，请重试", icon: "none" });
    }
  },

  /** 重新切割：关闭弹窗，回到参数调节区 */
  onReCut(this: any) {
    this.setData({ historyOpen: false });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  noop() {},
} as any);
