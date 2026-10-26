import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind 类名合并（等价于原站产物中的 jl()） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 以 <a download> 触发浏览器下载（等价于原站产物中的 Xu()） */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 默认文件名前缀 */
export const DEFAULT_PREFIX = "表情包";

/** 文件名前缀最大安全字符长度（避免加上序号和扩展名后超出 Windows 路径上限） */
export const MAX_PREFIX_LENGTH = 50;

/** Windows 保留设备名称正则（不区分大小写，支持包含任意扩展名如 CON.txt） */
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * 规范化并加固导出文件名前缀。
 * 1. 过滤前后空白及危险点字符；
 * 2. 替换非法字符（\ / : * ? " < > |）与控制字符为下划线；
 * 3. 截断至设定上限（MAX_PREFIX_LENGTH = 50 字符）；
 * 4. 防御 Windows 保留设备名（如 CON, CON.txt 自动转义为 _CON, _CON.txt）；
 * 5. 若处理后为空，自动回退到 DEFAULT_PREFIX ("表情包")。
 */
export function sanitizePrefix(raw?: string | null): string {
  if (!raw) return DEFAULT_PREFIX;

  // 1. 去除首尾空白
  let name = raw.trim();
  if (!name) return DEFAULT_PREFIX;

  // 2. 清理非法字符与控制字符
  name = name.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "_");

  // 3. 去除首尾的点与多余空格（Windows 文件名不能以点或空格结尾）
  name = name.replace(/^[. ]+|[. ]+$/g, "");

  // 4. 长度截断
  if (name.length > MAX_PREFIX_LENGTH) {
    name = name.slice(0, MAX_PREFIX_LENGTH).trimEnd();
  }

  // 5. 若清理后为空，使用安全默认值
  if (!name) return DEFAULT_PREFIX;

  // 6. 防御 Windows 保留设备名（CON -> _CON, CON.txt -> _CON.txt）
  if (WINDOWS_RESERVED_NAMES.test(name)) {
    name = `_${name}`;
  }

  return name;
}

/** 兼容原有方法，统一委托给加固后的 sanitizePrefix */
export function sanitizeFileName(name: string): string {
  return sanitizePrefix(name);
}

/**
 * 规范化文件名后缀。
 * 允许为空字符串；若非空则过滤非法文件名字符并截断，若不包含连接符则自动添加前导下划线。
 */
export function sanitizeSuffix(raw?: string | null): string {
  if (!raw) return "";

  let name = raw.trim();
  if (!name) return "";

  // 清理非法字符与控制字符
  name = name.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "_");
  // 去除尾部的点与多余空格
  name = name.replace(/[. ]+$/g, "");

  if (name.length > MAX_PREFIX_LENGTH) {
    name = name.slice(0, MAX_PREFIX_LENGTH).trimEnd();
  }

  if (!name) return "";

  // 若用户未输入连接符（_、-、. 等），自动补齐前置下划线
  return /^[_\-. ]/.test(name) ? name : `_${name}`;
}

/** 字节数可读化（等价于原站产物中的 hp()） */
export function formatBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}