import { useState } from "react";
import { GripHorizontal, GripVertical, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormatDropdown } from "@/components/FormatDropdown";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/lib/split";
import {
  clamp,
  GRID_PRESETS,
  type GridPreset,
  isPresetActive,
  MAX_LINES,
  MAX_PERCENT,
  MIN_PERCENT,
} from "@/lib/geometry";
import { GridPresetPreview } from "@/components/GridPresetPreview";
import {
  clampTargetDuration,
  DEFAULT_TARGET_DURATION,
  describePlan,
  MAX_TARGET_DURATION,
  MIN_TARGET_DURATION,
  resolveDurationPlan,
} from "@/lib/duration";
import type { MediaInfo } from "@/lib/video";

export type LineUnit = "percent" | "pixel";

interface LineRowProps {
  axis: "h" | "v";
  label: string;
  value: number;
  maxValue: number;
  unit: LineUnit;
  disabled?: boolean;
  onChange: (value: number) => void;
  onRemove: () => void;
}

/** 单条切割线的数值输入行（等价于原站产物中的 gu） */
function LineRow({
  axis,
  label,
  value,
  maxValue,
  unit,
  disabled,
  onChange,
  onRemove,
}: LineRowProps) {
  const isHorizontal = axis === "h";
  const displayValue = unit === "percent" ? value : Math.round((value / 100) * maxValue);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    const next = unit === "percent" ? parsed : (parsed / maxValue) * 100;
    onChange(clamp(Number(next.toFixed(1)), MIN_PERCENT, MAX_PERCENT));
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-md"
        style={{ color: isHorizontal ? "hsl(var(--primary))" : "hsl(var(--accent))" }}
      >
        {isHorizontal ? <GripHorizontal className="size-4" /> : <GripVertical className="size-4" />}
      </div>
      <span className="w-14 shrink-0 text-sm text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        min={1}
        max={unit === "percent" ? 99 : Math.round(maxValue * 0.99)}
        step={unit === "percent" ? 0.1 : 1}
        disabled={disabled}
        className="h-9 w-24 px-2 tabular-nums"
        value={draft ?? displayValue}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) commit(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className="w-4 shrink-0 text-xs text-muted-foreground">
        {unit === "percent" ? "%" : "px"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto size-8 shrink-0 text-muted-foreground hover:text-destructive"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`删除${label}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

interface LineGroupProps {
  title: string;
  axis: "h" | "v";
  lines: number[];
  maxValue: number;
  unit: LineUnit;
  count: number;
  disabled?: boolean;
  onChange: (index: number, value: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

/** 一个方向（横线 / 竖线）的切割线列表（等价于原站产物中的 _u） */
function LineGroup({
  title,
  axis,
  lines,
  maxValue,
  unit,
  count,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: LineGroupProps) {
  const sortedIndexes = lines.map((_, i) => i).sort((a, b) => lines[a] - lines[b]);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span
          className="size-3 rounded-sm"
          style={{
            backgroundColor: axis === "h" ? "hsl(var(--primary))" : "hsl(var(--accent))",
          }}
        />
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">
          {count}/{MAX_LINES} 条
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={disabled || lines.length === 0}
            onClick={() => onRemove(sortedIndexes[sortedIndexes.length - 1] ?? 0)}
            aria-label={`减少一条${title}`}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={disabled || count >= MAX_LINES}
            onClick={onAdd}
            aria-label={`增加一条${title}`}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">当前无切割线</p>
      ) : (
        <div className="space-y-2">
          {sortedIndexes.map((index, order) => (
            <LineRow
              key={index}
              axis={axis}
              label={`线 ${order + 1}`}
              value={lines[index]}
              maxValue={maxValue}
              unit={unit}
              disabled={disabled}
              onChange={(value) => onChange(index, value)}
              onRemove={() => onRemove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LinePanelProps {
  info: MediaInfo;
  hLines: number[];
  vLines: number[];
  onHChange: (index: number, value: number) => void;
  onVChange: (index: number, value: number) => void;
  onHAdd: () => void;
  onVAdd: () => void;
  onHRemove: (index: number) => void;
  onVRemove: (index: number) => void;
  onApplyPreset: (hLines: number[], vLines: number[]) => void;
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  gifFps?: number;
  onGifFpsChange?: (fps: number) => void;
  videoBitrate?: number;
  onVideoBitrateChange?: (bitrate: number) => void;
  onHoverPreset?: (preset: GridPreset | null) => void;
  startTime?: number;
  endTime?: number;
  onStartTimeChange?: (value: number) => void;
  onEndTimeChange?: (value: number) => void;
  onPickCurrentFrame?: () => void;
  keepAudio?: boolean;
  onKeepAudioChange?: (value: boolean) => void;
  targetDuration?: number;
  onTargetDurationChange?: (value: number) => void;
  disabled?: boolean;
}

/** 右侧切割线控制面板：单位切换 + 网格预设 + 横线/竖线增删改 + 导出格式选择（等价于原站产物中的 vu） */
export function LinePanel({
  info,
  hLines,
  vLines,
  onHChange,
  onVChange,
  onHAdd,
  onVAdd,
  onHRemove,
  onVRemove,
  onApplyPreset,
  format,
  onFormatChange,
  gifFps = 12,
  onGifFpsChange,
  videoBitrate = 4.0,
  onVideoBitrateChange,
  onHoverPreset,
  startTime = 0,
  endTime = 0,
  onStartTimeChange,
  onEndTimeChange,
  onPickCurrentFrame,
  keepAudio = false,
  onKeepAudioChange,
  targetDuration = 0,
  onTargetDurationChange,
  disabled,
}: LinePanelProps) {
  const [unit, setUnit] = useState<LineUnit>("percent");
  const [hoveredPreset, setHoveredPreset] = useState<GridPreset | null>(null);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [draftEnd, setDraftEnd] = useState<string | null>(null);
  const [draftTarget, setDraftTarget] = useState<string | null>(null);
  const [lastTarget, setLastTarget] = useState(DEFAULT_TARGET_DURATION);

  const targetEnabled = targetDuration > 0;
  // 当前时间范围切出的片段原始时长（GIF 输入读不到时长时为 0）
  const sourceSpan = Math.max(
    0,
    (endTime > 0 ? endTime : info.duration || 0) - startTime,
  );
  const targetPlan =
    targetEnabled && sourceSpan > 0
      ? resolveDurationPlan(sourceSpan, targetDuration)
      : null;
  const targetHint = !targetEnabled
    ? ""
    : !targetPlan
      ? "该格式无法预读片段时长，切割时自动探测后再做变速/循环"
      : targetPlan.mode === "none"
        ? `当前片段 ${sourceSpan.toFixed(2)}s，与目标一致，直接输出`
        : `当前片段 ${sourceSpan.toFixed(2)}s → ${describePlan(targetPlan)}`;

  const handleToggleTarget = () => {
    if (disabled) return;
    if (targetEnabled) {
      setLastTarget(targetDuration);
      onTargetDurationChange?.(0);
    } else {
      onTargetDurationChange?.(clampTargetDuration(lastTarget || DEFAULT_TARGET_DURATION));
    }
    setDraftTarget(null);
  };

  const handlePresetMouseEnter = (preset: GridPreset) => {
    setHoveredPreset(preset);
    onHoverPreset?.(preset);
  };

  const handlePresetMouseLeave = () => {
    setHoveredPreset(null);
    onHoverPreset?.(null);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">网格预设</span>
          <div className="relative" onMouseLeave={handlePresetMouseLeave}>
            <div className="flex rounded-md border border-border divide-x divide-border">
              {GRID_PRESETS.map((preset, index) => {
                const active = isPresetActive(preset, hLines, vLines);
                const isFirst = index === 0;
                const isLast = index === GRID_PRESETS.length - 1;
                return (
                  <button
                    key={preset.id}
                    id={`preset-btn-${preset.id}`}
                    type="button"
                    disabled={disabled}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium transition-colors",
                      isFirst && "rounded-l-md",
                      isLast && "rounded-r-md",
                      active
                        ? "bg-primary font-bold text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                    onMouseEnter={() => handlePresetMouseEnter(preset)}
                    onPointerEnter={() => handlePresetMouseEnter(preset)}
                    onFocus={() => handlePresetMouseEnter(preset)}
                    onClick={() => {
                      onApplyPreset(preset.hLines, preset.vLines);
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* 悬停网格预设预览浮窗（当鼠标悬停在预设按钮上时展示九宫格等缩略图） */}
            {hoveredPreset && (
              <div
                id="preset-preview-popup"
                className="pointer-events-none absolute right-0 top-full z-50 mt-2 flex w-56 flex-col gap-2.5 rounded-xl border-2 border-foreground bg-card p-3 shadow-2xl sticker-shadow-sm animate-in fade-in-0 zoom-in-95 duration-150"
              >
                <GridPresetPreview preset={hoveredPreset} />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">位置单位</span>
          <div className="flex overflow-hidden rounded-md border border-border">
            {(
              [
                ["percent", "百分比"],
                ["pixel", "像素"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  unit === value
                    ? "bg-primary font-bold text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setUnit(value)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>

      <LineGroup
        title="水平横线"
        axis="h"
        lines={hLines}
        maxValue={info.height}
        unit={unit}
        count={hLines.length}
        disabled={disabled}
        onChange={onHChange}
        onAdd={onHAdd}
        onRemove={onHRemove}
      />

      <LineGroup
        title="垂直竖线"
        axis="v"
        lines={vLines}
        maxValue={info.width}
        unit={unit}
        count={vLines.length}
        disabled={disabled}
        onChange={onVChange}
        onAdd={onVAdd}
        onRemove={onVRemove}
      />

      <p className="text-xs text-muted-foreground">
        拖动预览中的切割线，或在上方输入精确数值；横线为粉色、竖线为蓝色。
      </p>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">导出封装格式</span>
          <span className="text-xs font-semibold text-primary">
            支持直接微信/QQ发表情
          </span>
        </div>
        <FormatDropdown value={format} onChange={onFormatChange} disabled={disabled} />

        {/* GIF 专有抽帧率配置 */}
        {format === "gif" && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/60 p-3 animate-in fade-in-0 duration-150">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">GIF 抽帧率 (FPS)</span>
              <span className="font-mono text-xs font-bold text-amber-500 tabular-nums">
                {gifFps} 帧/秒
              </span>
            </div>
            <input
              type="range"
              min={6}
              max={24}
              step={2}
              value={gifFps}
              disabled={disabled}
              onChange={(e) => onGifFpsChange?.(Number.parseInt(e.target.value, 10))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-border accent-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="GIF 抽帧率"
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              帧率适中(10~15fps)可确保动图流畅且体积轻巧，完美适配各社交平台表情包大小限制。
            </p>
          </div>
        )}

        {/* 视频专有画质码率配置 */}
        {format === "mp4" && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/60 p-3 animate-in fade-in-0 duration-150">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">视频画质码率</span>
              <span className="font-mono text-xs font-bold text-primary tabular-nums">
                {videoBitrate.toFixed(1)} Mbps
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={videoBitrate}
              disabled={disabled}
              onChange={(e) => onVideoBitrateChange?.(Number.parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-border accent-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="视频画质码率"
            />
          </div>
        )}
      </div>

      {/* 时间范围与保留音频设置（对应红色标注框功能） */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">时间范围</span>
          <span className="text-xs font-mono text-muted-foreground">
            {info.duration ? `${info.duration.toFixed(2)}s` : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            max={endTime > 0 ? endTime : undefined}
            disabled={disabled}
            value={draftStart ?? (startTime === 0 ? "0" : startTime)}
            onChange={(e) => setDraftStart(e.target.value)}
            onBlur={() => {
              if (draftStart !== null) {
                const val = Number.parseFloat(draftStart);
                onStartTimeChange?.(Number.isNaN(val) ? 0 : Math.max(0, Number(val.toFixed(2))));
                setDraftStart(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-9 px-2 text-center font-mono text-sm tabular-nums"
            placeholder="0"
          />
          <span className="shrink-0 font-mono text-muted-foreground">→</span>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={startTime || 0}
            disabled={disabled}
            value={draftEnd ?? (endTime === 0 ? (info.duration ? Number(info.duration.toFixed(2)) : "0") : endTime)}
            onChange={(e) => setDraftEnd(e.target.value)}
            onBlur={() => {
              if (draftEnd !== null) {
                const val = Number.parseFloat(draftEnd);
                onEndTimeChange?.(
                  Number.isNaN(val)
                    ? (info.duration ? Number(info.duration.toFixed(2)) : 0)
                    : Math.max(0, Number(val.toFixed(2))),
                );
                setDraftEnd(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-9 px-2 text-center font-mono text-sm tabular-nums"
            placeholder={info.duration ? info.duration.toFixed(2) : "0"}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full border border-border bg-muted/40 text-xs font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-muted hover:text-foreground active:bg-muted/80"
          disabled={disabled}
          onClick={onPickCurrentFrame}
        >
          取当前帧
        </Button>

        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (!disabled) onKeepAudioChange?.(!keepAudio);
          }}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onKeepAudioChange?.(!keepAudio);
            }
          }}
          className={cn(
            "flex cursor-pointer select-none items-center gap-2.5 pt-1 focus:outline-none",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <div
            role="switch"
            aria-checked={keepAudio}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              keepAudio ? "bg-amber-500" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "pointer-events-none block size-3.5 rounded-full bg-white shadow-sm ring-0 transition-transform",
                keepAudio ? "translate-x-4" : "translate-x-1",
              )}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            保留音频（表情包通常静音）
          </span>
        </div>
      </div>

      {/* 统一片段时长：超长加速压缩、过短循环补齐 */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">统一片段时长</span>
          <button
            type="button"
            role="switch"
            aria-checked={targetEnabled}
            aria-label="统一片段时长"
            disabled={disabled}
            onClick={handleToggleTarget}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              targetEnabled ? "bg-amber-500" : "bg-muted-foreground/30",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              className={cn(
                "pointer-events-none block size-3.5 rounded-full bg-white shadow-sm ring-0 transition-transform",
                targetEnabled ? "translate-x-4" : "translate-x-1",
              )}
            />
          </button>
        </div>

        {targetEnabled && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/60 p-3 animate-in fade-in-0 duration-150">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={MIN_TARGET_DURATION}
                max={MAX_TARGET_DURATION}
                disabled={disabled}
                value={draftTarget ?? targetDuration}
                onChange={(e) => setDraftTarget(e.target.value)}
                onBlur={() => {
                  if (draftTarget !== null) {
                    const parsed = Number.parseFloat(draftTarget);
                    if (!Number.isNaN(parsed)) {
                      onTargetDurationChange?.(clampTargetDuration(parsed));
                    }
                  }
                  setDraftTarget(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="h-9 w-24 px-2 text-center font-mono text-sm tabular-nums"
                aria-label="目标时长（秒）"
              />
              <span className="text-xs text-muted-foreground">秒 / 每个片段</span>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">{targetHint}</p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              片段比目标长则加速压缩（音轨同步变速），比目标短则循环补齐，时长一致时原样输出；
              GIF 加速时会自动提高输出帧率以保证流畅。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}