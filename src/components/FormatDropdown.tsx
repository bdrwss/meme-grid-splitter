import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Image as ImageIcon, Sparkles } from "lucide-react";
import { FilePlay } from "@/components/icons/file-play";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/lib/split";

interface FormatDropdownProps {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
  disabled?: boolean;
}

const FORMAT_OPTIONS: Array<{
  value: ExportFormat;
  label: string;
  badge?: string;
  desc: string;
  icon: typeof ImageIcon;
}> = [
  {
    value: "gif",
    label: "GIF 动图",
    badge: "推荐",
    desc: "循环播放，适合微信 / QQ 表情包",
    icon: ImageIcon,
  },
  {
    value: "mp4",
    label: "MP4 视频",
    badge: "原画",
    desc: "画质更高且体积更小，适合短视频",
    icon: FilePlay,
  },
];

/** 导出格式下拉选择菜单（位于右侧控制面板中） */
export function FormatDropdown({ value, onChange, disabled }: FormatDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption = FORMAT_OPTIONS.find((item) => item.value === value) ?? FORMAT_OPTIONS[0];
  const CurrentIcon = currentOption.icon;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-lg border-2 border-foreground bg-card px-3 text-left transition-all sticker-shadow-sm",
          "hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          open && "border-primary ring-2 ring-primary/20",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CurrentIcon className="size-4" />
          </div>
          <span className="font-bold text-foreground text-sm">{currentOption.label}</span>
          {currentOption.badge && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
              {currentOption.value === "gif" && <Sparkles className="size-2.5" />}
              {currentOption.badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180 text-primary",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 w-full overflow-hidden rounded-lg border-2 border-foreground bg-card p-1.5 shadow-xl sticker-shadow-sm animate-in fade-in-0 zoom-in-95"
        >
          {FORMAT_OPTIONS.map((option) => {
            const isSelected = option.value === value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md p-2.5 text-left transition-colors",
                  isSelected
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted text-foreground",
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-foreground">{option.label}</span>
                    {option.badge && (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[10px] font-bold",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {option.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                    {option.desc}
                  </p>
                </div>
                {isSelected && (
                  <Check className="mt-1 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
