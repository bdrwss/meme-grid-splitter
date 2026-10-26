/**
 * 视频/动图识别与元信息探测。
 * 逻辑与线上产物保持一致：GIF 走 <img> 取尺寸（无时长），其它格式走 <video> 取元数据。
 */

/** 允许的扩展名（与线上产物 Jf 一致） */
export const VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "webm",
  "mkv",
  "gif",
  "avi",
  "m4v",
  "ogv",
] as const;

/** 上传体积上限 1GB */
export const MAX_FILE_SIZE = 1073741824;

export interface MediaInfo {
  width: number;
  height: number;
  duration: number;
  isGif: boolean;
}

/** 取文件扩展名（小写，不含点） */
export function getExtension(file: File): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(file.name);
  return m ? m[1].toLowerCase() : "";
}

/** 是否为受支持可处理的视频/动图 */
export function isSupportedVideo(file: File): boolean {
  return (
    file.type === "image/gif" ||
    (VIDEO_EXTENSIONS as readonly string[]).includes(getExtension(file))
  );
}

/** 供 <input accept> 使用的扩展名列表 */
export const ACCEPT_ATTR = VIDEO_EXTENSIONS.map((e) => `.${e}`).join(",");

/** 探测媒体尺寸/时长；失败时抛出可直接展示给用户的中文错误 */
export async function probeMedia(file: File): Promise<MediaInfo> {
  const url = URL.createObjectURL(file);
  const isGif = file.type === "image/gif" || getExtension(file) === "gif";

  try {
    if (isGif) {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("GIF 文件无法解析"));
        el.src = url;
      });
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        duration: 0,
        isGif: true,
      };
    }

    const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.muted = true;
      el.onloadedmetadata = () => resolve(el);
      el.onerror = () =>
        reject(new Error("视频文件无法解析，可能格式不受支持或文件已损坏"));
      el.src = url;
    });

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("无法读取视频画面尺寸");
    }

    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      isGif: false,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 把远程/本地资源抓成 blob URL。
 * 原站用同一手段把 CDN 上的 ffmpeg-core.js / .wasm 转成同源 blob 再交给 worker。
 */
export async function fetchAsBlobUrl(url: string, mimeType: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

/**
 * 依据宽高动态计算画面比例标签（如 1:1, 16:9, 9:16, 4:3, 5:3 等）。
 * 针对标准工业比例采用精密容差匹配（<0.6% 相对误差），非标准尺寸通过 GCD 约分简化或输出浮点比值，
 * 绝不将非标准尺寸随意误标为标准比例。
 */
export function getAspectRatioLabel(width?: number, height?: number): string {
  if (!width || !height || width <= 0 || height <= 0) return "";

  const STANDARD_RATIOS = [
    { label: "1:1", w: 1, h: 1, ratio: 1 / 1 },
    { label: "16:9", w: 16, h: 9, ratio: 16 / 9 },
    { label: "9:16", w: 9, h: 16, ratio: 9 / 16 },
    { label: "4:3", w: 4, h: 3, ratio: 4 / 3 },
    { label: "3:4", w: 3, h: 4, ratio: 3 / 4 },
    { label: "3:2", w: 3, h: 2, ratio: 3 / 2 },
    { label: "2:3", w: 2, h: 3, ratio: 2 / 3 },
    { label: "21:9", w: 21, h: 9, ratio: 21 / 9 },
    { label: "9:21", w: 9, h: 21, ratio: 9 / 21 },
    { label: "5:4", w: 5, h: 4, ratio: 5 / 4 },
    { label: "4:5", w: 4, h: 5, ratio: 4 / 5 },
    { label: "16:10", w: 16, h: 10, ratio: 16 / 10 },
    { label: "10:16", w: 10, h: 16, ratio: 10 / 16 },
  ];

  const actualRatio = width / height;

  for (const s of STANDARD_RATIOS) {
    if (Math.abs(actualRatio - s.ratio) / s.ratio < 0.006) {
      if ((width > height) === (s.w > s.h)) {
        return s.label;
      }
    }
  }

  // 非标准比例：用最大公约数约分
  let x = Math.round(width);
  let y = Math.round(height);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  const d = x || 1;
  const rw = Math.round(width / d);
  const rh = Math.round(height / d);

  if (rw <= 32 && rh <= 32) {
    return `${rw}:${rh}`;
  }

  return actualRatio >= 1
    ? `${Number(actualRatio.toFixed(2))}:1`
    : `1:${Number((1 / actualRatio).toFixed(2))}`;
}