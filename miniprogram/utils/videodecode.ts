/**
 * 微信 VideoDecoder 封装：seek 定点取帧（单位 ms，官方文档语义）。
 *
 * 采用 mode:0 + abortAudio（只要画面），每次 seek 后轮询 getFrameData
 * 直到拿到该位置附近的帧（缓冲区空时返回 null，属正常现象）。
 */

export interface RawFrame {
  data: ArrayBuffer;
  width: number;
  height: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DecoderHandle {
  frameAt(tMs: number): Promise<RawFrame>;
  close(): Promise<void>;
}

/** 打开解码器（失败抛错） */
export async function openDecoder(videoPath: string): Promise<DecoderHandle> {
  const decoder = wx.createVideoDecoder();
  await decoder.start({ source: videoPath, mode: 0, abortAudio: true });

  const closed = { value: false };

  async function frameAt(tMs: number): Promise<RawFrame> {
    if (closed.value) throw new Error("decoder closed");
    await decoder.seek(Math.max(0, Math.round(tMs)));
    // 轮询直到拿到帧或超时
    const deadline = Date.now() + 8000;
    for (;;) {
      const f = decoder.getFrameData();
      if (f && f.data && f.width) {
        return { data: f.data as ArrayBuffer, width: f.width, height: f.height };
      }
      if (Date.now() > deadline) {
        throw new Error(`解码超时（${Math.round(tMs / 100) / 10}s 处取帧失败），视频可能损坏或格式不受支持`);
      }
      await sleep(6);
    }
  }

  async function close() {
    if (closed.value) return;
    closed.value = true;
    try {
      decoder.stop();
    } catch {
      /* ignore */
    }
    try {
      decoder.remove();
    } catch {
      /* ignore */
    }
  }

  return { frameAt, close };
}
