import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Film, Hash, History, Pause, Play, RefreshCw, Repeat, RotateCcw, Scissors, Volume2, VolumeX } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { cellCount, clamp, type GridPreset, MAX_PERCENT, MIN_PERCENT } from "@/lib/geometry";
import { getAspectRatioLabel, type MediaInfo } from "@/lib/video";

function formatTime(seconds: number): string {
  if (Number.isNaN(seconds) || !Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface PreviewCanvasProps {
  url: string;
  info: MediaInfo;
  fileName: string;
  fileSize?: number;
  hLines: number[];
  vLines: number[];
  onHChange: (index: number, value: number) => void;
  onVChange: (index: number, value: number) => void;
  onResetGrid?: () => void;
  onReplaceVideo?: () => void;
  showLines?: boolean;
  onToggleLines?: () => void;
  showLabels?: boolean;
  onToggleLabels?: () => void;
  onOpenHistory?: () => void;
  historyCount?: number;
  previewPreset?: GridPreset | null;
  disabled?: boolean;
  onTimeChange?: (time: number) => void;
}

type DragState = { axis: "h" | "v"; index: number } | null;

/** 预览区：视频/动图 + 可拖拽的横线（粉）与竖线（蓝）（等价于原站产物中的 bu） */
export function PreviewCanvas({
  url,
  info,
  fileName,
  fileSize,
  hLines,
  vLines,
  onHChange,
  onVChange,
  onResetGrid,
  onReplaceVideo,
  showLines: propShowLines,
  onToggleLines,
  showLabels = true,
  onToggleLabels,
  onOpenHistory,
  historyCount = 0,
  previewPreset,
  disabled,
  onTimeChange,
}: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dragging, setDragging] = useState<DragState>(null);
  const [internalShowLines, setInternalShowLines] = useState(true);
  const showLines = propShowLines ?? internalShowLines;

  const toggleLines = () => {
    if (onToggleLines) {
      onToggleLines();
    } else {
      setInternalShowLines((prev) => !prev);
    }
  };

  // 播放器状态（播放/暂停、静音、循环、进度与时长）
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoop, setIsLoop] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(info.duration || 0);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(true);
    setDuration(info.duration || 0);
    onTimeChange?.(0);
  }, [url, info.duration, onTimeChange]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleLoop = () => {
    const video = videoRef.current;
    if (!video) return;
    video.loop = !video.loop;
    setIsLoop(video.loop);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number.parseFloat(e.target.value);
    const video = videoRef.current;
    const dur = duration > 0 ? duration : (video?.duration || 0);
    if (video && Number.isFinite(dur) && dur > 0) {
      const nextTime = (pct / 100) * dur;
      video.currentTime = nextTime;
      setCurrentTime(nextTime);
      onTimeChange?.(nextTime);
    }
  };

  const totalDuration = duration > 0 ? duration : (videoRef.current?.duration || 0);
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // 计算网格单元格（自上而下、自左向右），用于渲染序号标识
  const cellBadges = useMemo(() => {
    if (!showLabels) return [];
    const sortedH = [...hLines].sort((a, b) => a - b);
    const sortedV = [...vLines].sort((a, b) => a - b);
    const hBounds = [0, ...sortedH, 100];
    const vBounds = [0, ...sortedV, 100];

    const list: Array<{
      index: number;
      top: number;
      left: number;
      width: number;
      height: number;
    }> = [];

    let idx = 1;
    for (let r = 0; r < hBounds.length - 1; r++) {
      for (let c = 0; c < vBounds.length - 1; c++) {
        const top = hBounds[r];
        const bottom = hBounds[r + 1];
        const left = vBounds[c];
        const right = vBounds[c + 1];
        list.push({
          index: idx++,
          top,
          left,
          width: right - left,
          height: bottom - top,
        });
      }
    }
    return list;
  }, [showLabels, hLines, vLines]);

  const startDrag = (axis: "h" | "v", index: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging({ axis, index });
  };

  const moveDrag = (axis: "h" | "v", index: number) => (e: React.PointerEvent) => {
    if (!dragging || dragging.axis !== axis || dragging.index !== index) return;
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;

    const raw =
      axis === "h"
        ? ((e.clientY - box.top) / box.height) * 100
        : ((e.clientX - box.left) / box.width) * 100;

    const value = clamp(Number(raw.toFixed(1)), MIN_PERCENT, MAX_PERCENT);
    if (axis === "h") onHChange(index, value);
    else onVChange(index, value);
  };

  const endDrag = () => setDragging(null);
  const isActive = (axis: "h" | "v", index: number) =>
    dragging?.axis === axis && dragging.index === index;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* 顶部工具栏：视窗规格与功能按钮组（均等重置、序号标识） */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Scissors className="size-3.5 text-primary" />
            画布视窗
          </span>
          <span className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-bold text-foreground">
            {hLines.length + 1}×{vLines.length + 1}
          </span>
          <span className="text-[11px] text-muted-foreground">
            ({cellCount(hLines.length, vLines.length)} 格)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={toggleLines}
            className="h-8 gap-1.5 rounded-md border-border bg-card px-2.5 text-xs font-bold text-foreground sticker-shadow-sm transition-all hover:border-foreground hover:bg-muted hover:text-foreground active:translate-x-0.5 active:translate-y-0.5"
            title={showLines ? "隐藏切割线" : "显示切割线"}
          >
            {showLines ? (
              <EyeOff className="size-3.5 text-muted-foreground" />
            ) : (
              <Eye className="size-3.5 text-primary" />
            )}
            {showLines ? "隐藏切割线" : "显示切割线"}
          </Button>

          {onResetGrid && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onResetGrid}
              className="h-8 gap-1.5 rounded-md border-border bg-card px-2.5 text-xs font-bold text-foreground sticker-shadow-sm transition-all hover:border-foreground hover:bg-muted hover:text-foreground active:translate-x-0.5 active:translate-y-0.5"
              title="重置各参考线为均匀分布"
            >
              <RotateCcw className="size-3.5 text-muted-foreground" />
              均等重置
            </Button>
          )}
          {onToggleLabels && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onToggleLabels}
              className={cn(
                "h-8 gap-1.5 rounded-md px-2.5 text-xs font-bold sticker-shadow-sm transition-all active:translate-x-0.5 active:translate-y-0.5",
                showLabels
                  ? "border-primary/50 bg-primary/10 text-primary hover:border-primary hover:bg-primary/20 hover:text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-foreground hover:bg-muted hover:text-foreground"
              )}
              title={showLabels ? "隐藏序号标识" : "显示序号标识"}
            >
              <Hash className={cn("size-3.5", showLabels ? "text-primary" : "text-muted-foreground")} />
              序号标识
            </Button>
          )}
          {onOpenHistory && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onOpenHistory}
              className="h-8 gap-1.5 rounded-md border-border bg-card px-2.5 text-xs font-bold text-foreground sticker-shadow-sm transition-all hover:border-foreground hover:bg-muted hover:text-foreground active:translate-x-0.5 active:translate-y-0.5"
              title="查看历史切割结果"
            >
              <History className="size-3.5 text-muted-foreground" />
              显示历史
              {historyCount > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                  {historyCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded-md border border-border bg-muted"
      >
        {info.isGif ? (
          <img
            src={url}
            alt={fileName}
            className="block h-auto max-h-[70vh] w-auto max-w-full"
            draggable={false}
          />
        ) : (
          <video
            ref={videoRef}
            src={url}
            className="block h-auto max-h-[70vh] w-auto max-w-full"
            autoPlay
            loop={isLoop}
            muted={isMuted}
            playsInline
            onTimeUpdate={() => {
              if (videoRef.current) {
                const t = videoRef.current.currentTime;
                setCurrentTime(t);
                onTimeChange?.(t);
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
                setDuration(videoRef.current.duration);
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onVolumeChange={() => {
              if (videoRef.current) setIsMuted(videoRef.current.muted);
            }}
            onEnded={() => {
              if (!isLoop) setIsPlaying(false);
            }}
          />
        )}

        {/* 单元格序号标识层 */}
        {showLabels && (
          <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden select-none animate-in fade-in-0 duration-150">
            {cellBadges.map((cell) => (
              <div
                key={`cell-badge-${cell.index}`}
                className="absolute flex items-center justify-center p-1"
                style={{
                  top: `${cell.top}%`,
                  left: `${cell.left}%`,
                  width: `${cell.width}%`,
                  height: `${cell.height}%`,
                }}
              >
                <span className="flex items-center gap-0.5 rounded-full border border-white/20 bg-slate-950/80 px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow-md backdrop-blur-sm">
                  <span className="text-primary">#</span>
                  {cell.index}
                </span>
              </div>
            ))}
          </div>
        )}

        {showLines && hLines.map((value, index) => (
          <div
            key={`h-${index}`}
            role="separator"
            aria-orientation="horizontal"
            aria-label={`横线 ${index + 1}，位于 ${value.toFixed(1)}%`}
            className={cn(
              "absolute inset-x-0 z-10 flex h-5 -translate-y-1/2 cursor-ns-resize items-center",
              disabled && "cursor-default",
            )}
            style={{ top: `${value}%` }}
            onPointerDown={startDrag("h", index)}
            onPointerMove={moveDrag("h", index)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div
              className={cn(
                "h-0.5 w-full border-t-2 border-dashed",
                isActive("h", index) ? "border-solid" : "",
              )}
              style={{ borderColor: "hsl(var(--primary))" }}
            />
            <span
              className={cn(
                "absolute left-1 top-1/2 -translate-y-1/2 rounded-sm px-1.5 py-0.5 text-xs font-medium tabular-nums",
                isActive("h", index) || !disabled ? "opacity-100" : "opacity-70",
              )}
              style={{
                backgroundColor: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
              }}
            >
              {value.toFixed(1)}%
            </span>
          </div>
        ))}

        {showLines && vLines.map((value, index) => (
          <div
            key={`v-${index}`}
            role="separator"
            aria-orientation="vertical"
            aria-label={`竖线 ${index + 1}，位于 ${value.toFixed(1)}%`}
            className={cn(
              "absolute inset-y-0 z-10 flex w-5 -translate-x-1/2 cursor-ew-resize justify-center",
              disabled && "cursor-default",
            )}
            style={{ left: `${value}%` }}
            onPointerDown={startDrag("v", index)}
            onPointerMove={moveDrag("v", index)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div
              className={cn(
                "h-full w-0.5 border-l-2 border-dashed",
                isActive("v", index) ? "border-solid" : "",
              )}
              style={{ borderColor: "hsl(var(--accent))" }}
            />
            <span
              className={cn(
                "absolute top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-medium tabular-nums",
                isActive("v", index) || !disabled ? "opacity-100" : "opacity-70",
              )}
              style={{
                backgroundColor: "hsl(var(--accent))",
                color: "hsl(var(--accent-foreground))",
              }}
            >
              {value.toFixed(1)}%
            </span>
          </div>
        ))}

        {/* 预设网格悬停预览图层 */}
        {previewPreset && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden animate-in fade-in-0 duration-150">
            {/* 预设标签 */}
            <div className="absolute right-2 top-2 rounded-full border border-primary/50 bg-background/95 px-2.5 py-0.5 text-xs font-bold text-primary shadow-md backdrop-blur-sm">
              预览：{previewPreset.label} {previewPreset.name} ({previewPreset.rows * previewPreset.cols}格)
            </div>

            {/* 预设横线预览 */}
            {previewPreset.hLines.map((val, idx) => (
              <div
                key={`prev-h-${idx}`}
                className="absolute inset-x-0 h-0.5 -translate-y-1/2 border-t-2 border-dashed border-primary shadow-[0_0_8px_hsl(var(--primary))]"
                style={{ top: `${val}%` }}
              />
            ))}

            {/* 预设竖线预览 */}
            {previewPreset.vLines.map((val, idx) => (
              <div
                key={`prev-v-${idx}`}
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 border-l-2 border-dashed border-accent shadow-[0_0_8px_hsl(var(--accent))]"
                style={{ left: `${val}%` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 视频播放进度与控制栏（对应原站红色标注框内容） */}
      <div className="flex w-full flex-col gap-2.5 border-t border-border pt-3">
        {/* 顶部进度条与时间显示 */}
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={Number.isFinite(progressPercent) ? progressPercent : 0}
            disabled={disabled || info.isGif}
            onChange={handleSeek}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-muted accent-primary hover:accent-primary/90 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="视频播放进度"
          />
          <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {formatTime(totalDuration)}
          </span>
        </div>

        {/* 底部控制按钮 */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled || info.isGif}
            onClick={togglePlay}
            className="size-8 rounded-md border-border bg-card text-foreground sticker-shadow-sm transition-all hover:border-foreground hover:bg-muted hover:text-foreground active:translate-x-0.5 active:translate-y-0.5"
            title={isPlaying ? "暂停播放" : "继续播放"}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled || info.isGif}
            onClick={toggleMute}
            className="size-8 rounded-md border-border bg-card text-foreground sticker-shadow-sm transition-all hover:border-foreground hover:bg-muted hover:text-foreground active:translate-x-0.5 active:translate-y-0.5"
            title={isMuted ? "开启声音" : "静音"}
          >
            {isMuted ? (
              <VolumeX className="size-4 text-muted-foreground" />
            ) : (
              <Volume2 className="size-4 text-primary" />
            )}
          </Button>
          <div className="mx-1 h-4 w-[1px] bg-border" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || info.isGif}
            onClick={toggleLoop}
            className={cn(
              "h-8 gap-1.5 rounded-md px-2.5 text-xs font-semibold sticker-shadow-sm transition-all active:translate-x-0.5 active:translate-y-0.5",
              isLoop
                ? "border-primary/50 bg-primary/10 text-primary hover:border-primary hover:bg-primary/20 hover:text-primary"
                : "border-border bg-card text-muted-foreground hover:border-foreground hover:bg-muted hover:text-foreground"
            )}
            title={isLoop ? "关闭循环播放" : "开启循环播放"}
          >
            <Repeat className="size-3.5" />
            循环播放
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 text-center text-xs text-muted-foreground">
        <Film className="size-3.5 shrink-0 text-primary" />
        {fileName && (
          <span className="max-w-[200px] truncate font-medium text-foreground" title={fileName}>
            {fileName}
          </span>
        )}
        {fileSize !== undefined && fileSize > 0 && (
          <>
            <span>·</span>
            <span>{formatBytes(fileSize)}</span>
          </>
        )}
        <span>·</span>
        <span>{info.isGif ? "动图" : (isLoop ? "循环播放中" : "单次播放")}</span>
        <span>·</span>
        <span>画面 {info.width}×{info.height} 像素</span>
        {getAspectRatioLabel(info.width, info.height) && (
          <span className="inline-flex items-center rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-foreground sticker-shadow-sm">
            {getAspectRatioLabel(info.width, info.height)}
          </span>
        )}
        {totalDuration > 0 && <span>· 时长 {totalDuration.toFixed(1)} 秒</span>}
      </div>
    </div>
  );
}

