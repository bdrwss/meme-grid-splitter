import { CircleX, LoaderCircle, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ExportFormat } from "@/lib/split";

export type CutPhase = "idle" | "engine" | "cutting" | "done";

interface CutPanelProps {
  open: boolean;
  phase: CutPhase;
  engineMsg: string;
  progress: { done: number; total: number; ratio: number };
  cellCount: number;
  format: ExportFormat;
  onCancel?: () => void;
}

/** 独立切割进度弹窗：居中悬浮、高质感遮罩、进度百分比及取消支持，切割完成自动消失 */
export function CutPanel({
  open,
  phase,
  engineMsg,
  progress,
  cellCount,
  format,
  onCancel,
}: CutPanelProps) {
  if (!open) return null;

  const currentStep = Math.min(progress.done + 1, progress.total || cellCount);
  const percent = Math.min(100, Math.max(0, Math.round(progress.ratio * 100)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩背景 */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in-0 duration-200"
        aria-hidden="true"
      />

      {/* 弹窗主体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cut-progress-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border-2 border-foreground bg-card p-6 shadow-2xl sticker-shadow-primary animate-in zoom-in-95 duration-200"
      >
        <div className="space-y-5">
          {/* 标题栏 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-primary/10 text-primary">
                {phase === "engine" ? (
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                ) : (
                  <Scissors className="size-5 animate-pulse text-primary" />
                )}
              </div>
              <div>
                <h3 id="cut-progress-title" className="text-base font-bold text-foreground">
                  {phase === "engine" ? "准备本地处理引擎" : "正在切割表情包"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  共 {cellCount} 个切片 · {format.toUpperCase()} 格式
                </p>
              </div>
            </div>

            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-bold text-primary">
              {percent}%
            </span>
          </div>

          {/* 进度主体 */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
            {phase === "engine" ? (
              <div className="flex items-center gap-2.5 py-1 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin text-primary" />
                <span className="truncate">{engineMsg || "正在加载 FFmpeg 本地引擎…"}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    正在切割第 <strong className="font-mono text-primary text-sm">{currentStep}</strong> / {cellCount} 个
                  </span>
                  <span className="font-mono font-bold text-foreground">{percent}%</span>
                </div>
                <Progress value={percent} className="h-2.5" />
              </>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {format === "gif"
                ? "正在逐格提取调色板并编码为无限循环 GIF 动图，处理均在浏览器本地完成。"
                : "正在按切割线裁剪视频切片并编码为 MP4，处理均在浏览器本地完成。"}
            </p>
          </div>

          {/* 取消操作 */}
          {onCancel && (
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="gap-1.5 border-destructive/50 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <CircleX className="size-3.5" />
                取消切割
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}