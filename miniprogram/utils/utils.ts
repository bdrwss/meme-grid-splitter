/**
 * 小程序通用工具函数：前缀/后缀加固、字节格式化、时间格式化、画面宽高比计算。
 */

export const DEFAULT_PREFIX = "表情包";
export const MAX_PREFIX_LENGTH = 50;

const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * 规范化并加固导出文件名前缀。
 */
export function sanitizePrefix(raw?: string | null): string {
  if (!raw) return DEFAULT_PREFIX;
  let name = raw.trim();
  if (!name) return DEFAULT_PREFIX;
  name = name.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "_");
  name = name.replace(/^[. ]+|[. ]+$/g, "");
  if (name.length > MAX_PREFIX_LENGTH) {
    name = name.slice(0, MAX_PREFIX_LENGTH).replace(/\s+$/, "");
  }
  if (!name) return DEFAULT_PREFIX;
  if (WINDOWS_RESERVED_NAMES.test(name)) {
    name = `_${name}`;
  }
  return name;
}

/**
 * 规范化文件名后缀。
 */
export function sanitizeSuffix(raw?: string | null): string {
  if (!raw) return "";
  let name = raw.trim();
  if (!name) return "";
  name = name.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "_");
  name = name.replace(/[. ]+$/g, "");
  if (name.length > MAX_PREFIX_LENGTH) {
    name = name.slice(0, MAX_PREFIX_LENGTH).replace(/\s+$/, "");
  }
  if (!name) return "";
  return /^[_\-. ]/.test(name) ? name : `_${name}`;
}

/**
 * 字节数可读化。
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * 秒数格式化为 mm:ss。
 */
export function formatTime(seconds: number): string {
  if (Number.isNaN(seconds) || !Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 依据宽高动态计算画面比例标签（如 1:1, 16:9, 9:16, 4:3, 3:2 等）。
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
  return actualRatio > 1 ? `${actualRatio.toFixed(2)}:1` : `1:${(1 / actualRatio).toFixed(2)}`;
}
