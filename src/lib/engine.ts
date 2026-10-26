import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchAsBlobUrl } from "./video";

/**
 * ffmpeg.wasm 引擎的加载与管理。
 * 与原站一致：核心（core.js + core.wasm）从多个 CDN 依次尝试加载，
 * worker 使用同源 `ffmpeg/worker.js`（由 public/ffmpeg 提供）。
 *
 * 路径说明：原站构建里写的是 `${window.location.origin}/ffmpeg/worker.js`，
 * 只在「dist 被作为域名根目录托管」时成立；这里改为相对页面自身解析，
 * 域名根目录下解析结果与原站逐字相同，同时让 dist 放在子目录（或直接打开 index.html）
 * 时也能正确找到 worker，不会出现「引擎加载失败」。
 */

/** 依次尝试的 ffmpeg core 镜像，优先尝试同源本地资源，失败时降级到各大 CDN */
export const CORE_SOURCES = [
  "./ffmpeg",
  "https://registry.npmmirror.com/@ffmpeg/core/0.12.10/files/dist/esm",
  "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm",
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm",
];

/** 引擎初始化超时（毫秒） */
export const ENGINE_TIMEOUT_MS = 90000;

const WORKER_PATH = "./ffmpeg/worker.js";

export type EngineStatusHandler = (message: string) => void;

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * 惰性获取（并复用）已加载好的 FFmpeg 实例。
 * 并发调用会共享同一次加载过程。
 */
export async function getFFmpeg(onStatus?: EngineStatusHandler): Promise<FFmpeg> {
  if (instance) return instance;
  if (loading) return loading;

  loading = (async () => {
    let lastError: unknown = null;

    for (const base of CORE_SOURCES) {
      const ff = new FFmpeg();
      try {
        onStatus?.("正在加载本地处理引擎（约 30MB，首次使用仅需下载一次）…");
        const resolvedBase = new URL(base, document.baseURI).href.replace(/\/$/, "");
        const coreURL = await fetchAsBlobUrl(`${resolvedBase}/ffmpeg-core.js`, "text/javascript");
        onStatus?.("引擎下载完成，正在初始化…");
        const wasmURL = await fetchAsBlobUrl(`${resolvedBase}/ffmpeg-core.wasm`, "application/wasm");

        await withTimeout(
          ff.load({
            coreURL,
            wasmURL,
            classWorkerURL: new URL(WORKER_PATH, document.baseURI).href,
          }),
          ENGINE_TIMEOUT_MS,
          `引擎初始化超时（超过 ${ENGINE_TIMEOUT_MS / 1000} 秒无响应）`,
        );

        instance = ff;
        return ff;
      } catch (err) {
        lastError = err;
        try {
          ff.terminate();
        } catch {
          /* ignore */
        }
      }
    }

    loading = null;
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `本地处理引擎加载失败（${message}），请检查网络后重新点击「开始切割」重试`,
    );
  })();

  return loading;
}

/** 销毁引擎实例，释放 wasm 内存（等价于原站产物中的 sp()） */
export function terminateFFmpeg() {
  try {
    instance?.terminate();
  } catch {
    /* ignore */
  }
  instance = null;
  loading = null;
}

/** 挂上 ffmpeg 日志尾巴，便于把编码失败的真实原因一并展示给用户 */
export function attachLogTail(ff: FFmpeg) {
  const tail: string[] = [];
  const handler = ({ message }: { message: string }) => {
    if (message) {
      tail.push(message);
      if (tail.length > 30) tail.shift();
    }
  };
  ff.on("log", handler);
  return {
    tail,
    detach: () => ff.off("log", handler),
  };
}