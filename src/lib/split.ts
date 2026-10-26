import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { attachLogTail, getFFmpeg, type EngineStatusHandler } from "./engine";
import {
  buildConstrainedMp4Graph,
  buildGifHead,
  resolveDurationPlan,
} from "./duration";
import { snapRect, type Rect } from "./geometry";
import { getExtension } from "./video";

/**
 * 逐格裁剪与编码。
 *
 * 两条链路的滤镜/参数与原站产物完全一致：
 * - GIF：`-filter_complex` 拆链出调色板，`-an`、`-loop 0` 输出无限循环动图；
 *        注意 crop 的输出必须被 split 消费（带 [c] 标签），否则报
 *        "Cannot find a matching stream for unlabeled input pad 0"。
 * - MP4：`-vf` 简单裁剪 + libx264；优先 `-c:a copy`，失败回退 aac 128k。
 *
 * 启用「统一片段时长」后（duration.ts 给出策略）：
 * - 加速：`setpts` 压时间轴，音频同步走 atempo 链，输出用 `-t` 卡到目标时长；
 * - 循环：`split` 复制 N 路再 `concat` 拼回，同样用 `-t` 截到目标时长；
 * - 恰好相等：完全走上面的原有链路，不做任何处理。
 */

export type ExportFormat = "mp4" | "gif";

export interface SplitResult {
  index: number;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

export interface SplitProgress {
  done: number;
  total: number;
  ratio: number;
}

export interface SplitCellOptions {
  ff: FFmpeg;
  inputName: string;
  outName: string;
  rect: Rect;
  format: ExportFormat;
  gifFps?: number;
  videoBitrate?: number;
  startTime?: number;
  endTime?: number;
  keepAudio?: boolean;
  /** 预设的目标时长（秒）；0 或未填表示不做时长约束 */
  targetDuration?: number;
  /** 片段的原始时长（秒）；0 或未填时按 -ss/-t 区间推算 */
  sourceDuration?: number;
}

export interface RunSplitOptions {
  file: File;
  rects: Rect[];
  format: ExportFormat;
  gifFps?: number;
  videoBitrate?: number;
  startTime?: number;
  endTime?: number;
  keepAudio?: boolean;
  targetDuration?: number;
  sourceDuration?: number;
  onEngineStatus?: EngineStatusHandler;
  /** 非致命提示（如无法探测片段时长） */
  onNotice?: (message: string) => void;
  onProgress?: (progress: SplitProgress) => void;
  abortRef?: { aborted: boolean };
}

/** 裁剪滤镜（参数与原先 -vf 里的一致） */
function cropFilter({ w, h, x, y }: Rect): string {
  return `crop=w=${w}:h=${h}:x=${x}:y=${y}`;
}

/** 用 ffmpeg 自身日志兜底探测时长（GIF 等浏览器读不出 duration 的输入） */
async function probeInputDuration(ff: FFmpeg, inputName: string): Promise<number> {
  const lines: string[] = [];
  const handler = ({ message }: { message: string }) => {
    if (message && lines.length < 40) lines.push(message);
  };
  ff.on("log", handler);
  try {
    await ff.exec(["-i", inputName]);
  } catch {
    /* 只传 -i 时 ffmpeg 必然返回非 0，有用的 Duration 就在日志里 */
  } finally {
    ff.off("log", handler);
  }

  for (const line of lines) {
    const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
    if (m) {
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
  }
  return 0;
}

/** 裁剪并编码单格，写入 outName */
export async function splitCell({
  ff,
  inputName,
  outName,
  rect,
  format,
  gifFps,
  videoBitrate,
  startTime,
  endTime,
  keepAudio = false,
  targetDuration,
  sourceDuration,
}: SplitCellOptions): Promise<void> {
  const { x, y, w, h } = snapRect(rect);
  const crop = cropFilter({ x, y, w, h });

  const timeArgs: string[] = [];
  const start = Math.max(0, startTime ?? 0);
  if (start > 0) {
    timeArgs.push("-ss", start.toFixed(3));
  }
  const rangeDuration =
    endTime !== undefined && endTime > start ? endTime - start : 0;
  if (rangeDuration > 0) {
    timeArgs.push("-t", rangeDuration.toFixed(3));
  }

  // 时长约束策略：优先用调用方给的原始时长（含“切到片尾”的情况）
  const plan = resolveDurationPlan(
    sourceDuration && sourceDuration > 0 ? sourceDuration : rangeDuration,
    targetDuration ?? 0,
  );
  // 仅当确实需要变速/循环时才卡输出时长；恰好相等时维持原有行为
  const targetArgs = plan.mode === "none" ? [] : ["-t", plan.targetDuration.toFixed(3)];

  if (format === "gif") {
    const fps = gifFps && gifFps > 0 ? gifFps : 12;
    // 加速时 fps 放在 setpts 之前：抽帧数不变、只压缩时间轴，循环则先拼再抽帧
    const head = buildGifHead(crop, plan, fps);

    const filterComplex = [
      head,
      `[c]split[s0][s1]`,
      `[s0]palettegen=max_colors=128:stats_mode=diff[p]`,
      `[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle[out]`,
    ].join(";");

    const { tail, detach } = attachLogTail(ff);
    try {
      const code = await ff.exec([
        ...timeArgs,
        "-i",
        inputName,
        "-filter_complex",
        filterComplex,
        "-map",
        "[out]",
        "-an",
        "-loop",
        "0",
        ...targetArgs,
        outName,
      ]);
      if (code !== 0) {
        const reason = tail.slice(-5).join(" | ");
        throw new Error(`GIF 编码失败（ffmpeg 返回码 ${code}${reason ? `：${reason}` : ""}）`);
      }
      return;
    } finally {
      detach();
    }
  }

  const bitrate = videoBitrate && videoBitrate > 0 ? videoBitrate : 4.0;

  // 有时长约束：滤镜图里已经带音画处理，音频必须重编码（不能 copy）
  if (plan.mode !== "none") {
    const attempts = keepAudio ? [true, false] : [false];
    let lastError: Error | null = null;

    for (const withAudio of attempts) {
      const { tail, detach } = attachLogTail(ff);
      let code = -1;
      try {
        code = await ff.exec([
          ...timeArgs,
          "-i",
          inputName,
          "-filter_complex",
          buildConstrainedMp4Graph(crop, plan, withAudio),
          "-map",
          "[v]",
          ...(withAudio ? ["-map", "[a]"] : []),
          "-c:v",
          "libx264",
          "-b:v",
          `${bitrate}M`,
          "-preset",
          "veryfast",
          ...(withAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
          "-movflags",
          "+faststart",
          ...targetArgs,
          outName,
        ]);
      } finally {
        detach();
      }

      if (code === 0) return;
      const reason = tail.slice(-5).join(" | ");
      lastError = new Error(
        `MP4 编码失败（ffmpeg 返回码 ${code}${reason ? `：${reason}` : ""}）`,
      );
    }

    throw lastError ?? new Error("MP4 编码失败");
  }

  // MP4：根据 keepAudio 选择保留音频或静音；保留音频时优先复制音轨，失败回退 aac 128k
  const audioStrategies = keepAudio
    ? [
        ["-c:a", "copy"],
        ["-c:a", "aac", "-b:a", "128k"],
      ]
    : [["-an"]];

  let lastError: Error | null = null;
  for (const audio of audioStrategies) {
    const code = await ff.exec([
      ...timeArgs,
      "-i",
      inputName,
      "-vf",
      crop,
      "-c:v",
      "libx264",
      "-b:v",
      `${bitrate}M`,
      "-preset",
      "veryfast",
      ...audio,
      "-movflags",
      "+faststart",
      outName,
    ]);
    if (code === 0) return;
    lastError = new Error("MP4 编码失败");
  }

  throw lastError ?? new Error("MP4 编码失败");
}

/**
 * 按矩形列表批量切割，返回每格的 Blob/预览 URL。
 * 支持中途取消（abortRef.aborted）。
 */
export async function runSplit({
  file,
  rects,
  format,
  gifFps,
  videoBitrate,
  startTime,
  endTime,
  keepAudio,
  targetDuration,
  sourceDuration,
  onEngineStatus,
  onNotice,
  onProgress,
  abortRef,
}: RunSplitOptions): Promise<SplitResult[]> {
  const ff = await getFFmpeg(onEngineStatus);

  const inputName = `input.${getExtension(file) || "mp4"}`;
  const outName = `out.${format}`;

  await ff.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));

  // 时长约束需要的「片段原始时长」：优先用调用方给的，其次用 -ss/-t 区间，
  // 都拿不到时（如 GIF 输入）再从 ffmpeg 日志里探测一次
  const target = targetDuration && targetDuration > 0 ? targetDuration : 0;
  let source = sourceDuration && sourceDuration > 0 ? sourceDuration : 0;
  if (source <= 0 && endTime !== undefined && endTime > (startTime ?? 0)) {
    source = endTime - (startTime ?? 0);
  }
  if (target > 0 && source <= 0) {
    source = await probeInputDuration(ff, inputName);
    if (source <= 0) {
      onNotice?.("未能识别片段时长，本次已按原始时长输出");
    }
  }

  const total = rects.length;
  let done = 0;

  const onFfmpegProgress = ({ progress }: { progress?: number; time?: number }) => {
    onProgress?.({
      done,
      total,
      ratio: Math.min((done + Math.min(Math.max(progress || 0, 0), 1)) / total, 1),
    });
  };

  ff.on("progress", onFfmpegProgress);

  const results: SplitResult[] = [];
  try {
    for (const rect of rects) {
      if (abortRef?.aborted) throw new DOMException("用户取消切割", "AbortError");

      onProgress?.({ done, total, ratio: done / total });
      await splitCell({
        ff,
        inputName,
        outName,
        rect,
        format,
        gifFps,
        videoBitrate,
        startTime,
        endTime,
        keepAudio,
        targetDuration: target,
        sourceDuration: source,
      });
      if (abortRef?.aborted) throw new DOMException("用户取消切割", "AbortError");

      const data = await ff.readFile(outName);
      const { w, h } = snapRect(rect);
      const blob = new Blob([data as unknown as BlobPart], {
        type: format === "gif" ? "image/gif" : "video/mp4",
      });

      results.push({
        index: done,
        blob,
        url: URL.createObjectURL(blob),
        width: w,
        height: h,
      });

      done += 1;
      onProgress?.({ done, total, ratio: done / total });
    }
  } finally {
    ff.off("progress", onFfmpegProgress);
    for (const name of [inputName, outName]) {
      try {
        await ff.deleteFile(name);
      } catch {
        /* ignore */
      }
    }
  }

  return results;
}