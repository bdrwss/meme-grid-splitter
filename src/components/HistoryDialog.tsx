import { useEffect } from "react";
import { Package, X } from "lucide-react";
import { DownloadPanel } from "@/components/DownloadPanel";
import type { ExportFormat, SplitResult } from "@/lib/split";

interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: SplitResult[];
  resultFormat: ExportFormat;
  format?: ExportFormat;
  onFormatChange?: (format: ExportFormat) => void;
  prefix: string;
  onPrefixChange: (prefix: string) => void;
  suffix?: string;
  onSuffixChange?: (suffix: string) => void;
  canReCut?: boolean;
  busy?: boolean;
  onReCut?: () => void;
}

/** 步骤2弹窗：查看和下载结果与切割历史 */
export function HistoryDialog({
  open,
  onOpenChange,
  results,
  resultFormat,
  prefix,
  onPrefixChange,
  suffix = "",
  onSuffixChange,
  canReCut = false,
  busy = false,
  onReCut,
}: HistoryDialogProps) {
  // ESC 键关闭 & 锁住背景滚动
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleReCut = () => {
    onOpenChange(false);
    onReCut?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
      {/* 遮罩背景 */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* 弹窗主体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-dialog-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border-2 border-foreground bg-background shadow-2xl sticker-shadow-primary animate-in zoom-in-95 duration-200"
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-primary text-sm font-bold text-primary-foreground sticker-shadow-sm">
              2
            </span>
            <div>
              <h2 id="history-dialog-title" className="text-lg font-bold leading-tight text-foreground">
                步骤 2：查看和下载结果
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                可单独下载，或打包成 ZIP 批量导出
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95"
            title="关闭弹窗 (Esc)"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 内容主体（可滚动） */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {results.length > 0 ? (
            <DownloadPanel
              results={results}
              resultFormat={resultFormat}
              prefix={prefix}
              onPrefixChange={onPrefixChange}
              suffix={suffix}
              onSuffixChange={onSuffixChange}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex size-14 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50">
                <Package className="size-7 text-muted-foreground" />
              </div>
              <p className="text-base font-semibold text-foreground">暂无历史切割结果</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                请先在步骤 1 中调整切割线与导出格式，然后点击「开始切割」生成表情包。
              </p>
            </div>
          )}
        </div>

        {/* 底部信息栏 */}
        <div className="flex items-center justify-between border-t border-border bg-card/60 px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {results.length > 0 ? `共 ${results.length} 个切片结果就绪` : "未生成结果"}
          </span>
        </div>
      </div>
    </div>
  );
}
