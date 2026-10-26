import type { GridPreset } from "@/lib/geometry";

interface GridPresetPreviewProps {
  preset: GridPreset;
}

/** 预设网格预览浮窗小卡片：直观显示九宫格/田字格等缩略结构与格数说明 */
export function GridPresetPreview({ preset }: GridPresetPreviewProps) {
  const totalCells = preset.rows * preset.cols;

  return (
    <div className="flex flex-col gap-2.5">
      {/* 顶部标题与格数 */}
      <div className="flex items-center justify-between border-b border-border/80 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-sm font-bold text-foreground">
            {preset.label}
          </span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
            {preset.name}
          </span>
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          共 {totalCells} 格
        </span>
      </div>

      {/* 中心网格预览缩略图（正方形画布） */}
      <div className="flex items-center justify-center py-1">
        <div
          className="relative size-24 overflow-hidden rounded-md border-2 border-foreground/60 bg-muted/40 p-1 sticker-shadow-sm"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${preset.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${preset.rows}, minmax(0, 1fr))`,
            gap: "2px",
          }}
        >
          {Array.from({ length: totalCells }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-center rounded-[2px] border border-primary/30 bg-primary/15 font-mono text-[10px] font-bold text-primary transition-colors"
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* 底部详细说明 */}
      <div className="border-t border-border/60 pt-1.5 text-center">
        <p className="text-[11px] leading-snug text-muted-foreground">
          {preset.desc}
        </p>
        <p className="mt-0.5 text-[10px] font-medium text-primary">
          点击直接应用此网格排布
        </p>
      </div>
    </div>
  );
}
