/**
 * 片段时长约束策略。
 *
 * 目标：把每个切割片段的播放时长统一到「预设时长」。
 * - 原始片段长于预设时长 → 加速（时间挤压），输出时长 = 预设时长；
 * - 原始片段短于预设时长 → 循环拼接，输出时长 = 预设时长；
 * - 两者相等（容差内） → 原样输出，不做任何变速或循环。
 *
 * 这里只做纯计算（不碰 ffmpeg），实际滤镜拼装放在 split.ts。
 */

/** 目标时长允许的最小值（秒） */
export const MIN_TARGET_DURATION = 0.2;

/** 目标时长允许的最大值（秒） */
export const MAX_TARGET_DURATION = 60;

/** 开关打开时的默认目标时长（秒） */
export const DEFAULT_TARGET_DURATION = 3;

/**
 * 视为「恰好相等」的容差（秒）。
 * 约一两帧的量级：差值比它还小就不值得为它做一次变速重编码。
 */
const EQUAL_TOLERANCE = 0.05;

/** 循环拼接次数上限，避免极短片段拼出难以处理的巨大滤镜图 */
const MAX_LOOP_REPEATS = 200;

/** GIF 末尾补帧：克隆最后一帧，交给 -t 切出精确时长 */
const TAIL_PAD = "tpad=stop_mode=clone:stop_duration=1";

export type DurationMode = "none" | "speed" | "loop";

export interface DurationPlan {
  /** none：原样输出；speed：加速压缩；loop：循环填充 */
  mode: DurationMode;
  /** 片段原始时长（秒），未知时为 0 */
  sourceDuration: number;
  /** 目标时长（秒） */
  targetDuration: number;
  /** 加速倍速，mode === "speed" 时大于 1 */
  speed: number;
  /** 循环次数，mode === "loop" 时大于等于 2 */
  repeats: number;
}

/** 无需任何处理的计划（未启用时长约束 / 时长未知 / 恰好相等） */
export const EMPTY_PLAN: DurationPlan = {
  mode: "none",
  sourceDuration: 0,
  targetDuration: 0,
  speed: 1,
  repeats: 1,
};

/** 把任意输入收敛到合法的目标时长（保留一位小数），0 表示不启用 */
export function clampTargetDuration(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rounded = Math.round(value * 10) / 10;
  return Number(
    Math.min(Math.max(rounded, MIN_TARGET_DURATION), MAX_TARGET_DURATION).toFixed(1),
  );
}

/**
 * 计算某段素材在目标时长约束下的处理策略。
 * sourceDuration 或 targetDuration 缺失（<= 0）时返回 EMPTY_PLAN，调用方按原逻辑输出。
 */
export function resolveDurationPlan(
  sourceDuration: number,
  targetDuration: number,
): DurationPlan {
  if (!(sourceDuration > 0) || !(targetDuration > 0)) return EMPTY_PLAN;

  if (Math.abs(sourceDuration - targetDuration) <= EQUAL_TOLERANCE) {
    return { ...EMPTY_PLAN, sourceDuration, targetDuration };
  }

  if (sourceDuration > targetDuration) {
    return {
      mode: "speed",
      sourceDuration,
      targetDuration,
      speed: sourceDuration / targetDuration,
      repeats: 1,
    };
  }

  // 向上取整后仍不足（浮点误差）时再补一次，确保拼接总长 >= 目标时长
  let repeats = Math.ceil(targetDuration / sourceDuration);
  if (repeats * sourceDuration + 1e-3 < targetDuration) repeats += 1;
  repeats = Math.min(Math.max(repeats, 2), MAX_LOOP_REPEATS);

  return { mode: "loop", sourceDuration, targetDuration, speed: 1, repeats };
}

/**
 * 把速度因子拆成若干段 atempo（单段有效区间为 0.5~2），
 * 保证加速时音频与画面同步且不出现变速失真过大。
 */
export function buildTempoChain(speed: number): string[] {
  if (!(speed > 1)) return [];
  const chain: string[] = [];
  let rest = speed;
  while (rest > 2) {
    chain.push("atempo=2");
    rest /= 2;
  }
  if (rest > 1.0001) chain.push(`atempo=${rest.toFixed(4)}`);
  return chain;
}

/** 给界面提示用的一句话描述（无约束时返回空串） */
export function describePlan(plan: DurationPlan): string {
  if (plan.mode === "speed") {
    return `加速 ${plan.speed.toFixed(2)}× 压缩到 ${plan.targetDuration.toFixed(2)}s`;
  }
  if (plan.mode === "loop") {
    return `循环 ${plan.repeats} 次补齐到 ${plan.targetDuration.toFixed(2)}s`;
  }
  return "";
}

/**
 * 循环拼接（只处理视频）：split 出 N 路同一帧序列再 concat 回一段，
 * after 为 concat 之后追加的收尾滤镜（如 setpts / fps）。
 */
export function loopVideoGraph(base: string, repeats: number, after: string): string {
  const labels = Array.from({ length: repeats }, (_, i) => `[v${i}]`);
  return [
    `${base},split=${repeats}${labels.join("")}`,
    `${labels.join("")}concat=n=${repeats}:v=1:a=0${after}`,
  ].join(";");
}

/**
 * 循环拼接（音画一起）：视频 split、音频 asplit，再按帧序交替喂给 concat，
 * 保证循环后音画依然对齐。
 */
export function loopAvGraph(base: string, repeats: number): string {
  const vLabels = Array.from({ length: repeats }, (_, i) => `[v${i}]`);
  const aLabels = Array.from({ length: repeats }, (_, i) => `[a${i}]`);
  const interleaved = vLabels.map((label, i) => `${label}${aLabels[i]}`).join("");
  return [
    `${base},split=${repeats}${vLabels.join("")}`,
    `[0:a]asplit=${repeats}${aLabels.join("")}`,
    `${interleaved}concat=n=${repeats}:v=1:a=1[v][a]`,
  ].join(";");
}

/**
 * 加速后 GIF 的输出帧率。
 * GIF 的帧延迟以 1/100 秒为单位，只有 10 / 20 / 50 这类
 * 「每帧时长刚好是整百分之一秒」的档位才能把总时长卡准；其余帧率会被取整到半帧~一帧的偏差。
 * 只往上提不提降，避免比用户设的抽帧率更卡。
 */
export function pickGifSpeedFps(fps: number, speed: number): number {
  const want = fps * speed;
  if (want >= 50) return 50;
  if (want >= 20) return 20;
  if (want >= 10 && fps < 10) return 10;
  return fps;
}

/**
 * GIF 输出的视频头部链：从 [0:v] + crop 开始，统一输出到 [c] 标签。
 * - 加速：先按用户抽帧率抽样，再压时间轴，最后按整百分之一秒的帧率重新铺开
 *        （帧数与不加速时相当，只把时间挤短，而且不抽帧、不卡顿）；
 * - 循环：先拼够时长再抽帧。
 * 两种模式末尾都接 tpad 克隆末帧：GIF 帧延迟按百分之一秒取整，
 * 末尾少半帧时靠它补齐，再由调用方的 -t 精确切到目标时长。
 */
export function buildGifHead(crop: string, plan: DurationPlan, fps: number): string {
  const base = `[0:v]${crop}`;
  if (plan.mode === "speed") {
    const outFps = pickGifSpeedFps(fps, plan.speed);
    return `${base},fps=${fps},setpts=(PTS-STARTPTS)/${plan.speed.toFixed(4)},fps=${outFps},${TAIL_PAD}[c]`;
  }
  if (plan.mode === "loop") {
    return loopVideoGraph(base, plan.repeats, `,setpts=PTS-STARTPTS,fps=${fps},${TAIL_PAD}[c]`);
  }
  return `${base},fps=${fps}[c]`;
}

/**
 * MP4 时长约束滤镜图：加速走 setpts（音频 atempo 同步），循环走 split/concat。
 * withAudio 只对加速分支和循环分支的音轨做差别，输入无音轨时由调用方降级重试。
 */
export function buildConstrainedMp4Graph(
  crop: string,
  plan: DurationPlan,
  withAudio: boolean,
): string {
  const base = `[0:v]${crop}`;

  if (plan.mode === "speed") {
    const parts = [`${base},setpts=(PTS-STARTPTS)/${plan.speed.toFixed(4)}[v]`];
    if (withAudio) {
      const tempo = buildTempoChain(plan.speed).join(",");
      parts.push(`[0:a]${tempo},asetpts=PTS-STARTPTS[a]`);
    }
    return parts.join(";");
  }

  if (withAudio) return loopAvGraph(base, plan.repeats);
  return loopVideoGraph(base, plan.repeats, "[v]");
}
