import type { ReactNode } from "react";

interface SectionProps {
  index: number;
  title: string;
  desc: string;
  action?: ReactNode;
  children: ReactNode;
}

/** 带序号标题的分区卡片（等价于原站产物中的 _p） */
export function Section({ index, title, desc, action, children }: SectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-card text-sm font-bold tabular-nums text-foreground">
            {index}
          </span>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <span className="hidden text-xs text-muted-foreground md:inline">{desc}</span>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}