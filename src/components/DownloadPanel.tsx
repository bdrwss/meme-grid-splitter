import { useState } from "react";
import JSZip from "jszip";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Package } from "@/components/icons/package";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cn,
  downloadBlob,
  sanitizePrefix,
  sanitizeSuffix,
  DEFAULT_PREFIX,
  MAX_PREFIX_LENGTH,
} from "@/lib/utils";
import type { ExportFormat, SplitResult } from "@/lib/split";

interface DownloadPanelProps {
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

/** 下载导出面板：前缀与后缀设置、单个/勾选/全部下载（等价于原站产物中的 Qu） */
export function DownloadPanel({
  results,
  resultFormat,
  prefix,
  onPrefixChange,
  suffix = "",
  onSuffixChange,
}: DownloadPanelProps) {
  const [internalSuffix, setInternalSuffix] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [packing, setPacking] = useState<"none" | "all" | "selected">("none");

  const effectiveSuffix = suffix !== undefined ? suffix : internalSuffix;
  const handleSuffixChange = (val: string) => {
    if (onSuffixChange) onSuffixChange(val);
    else setInternalSuffix(val);
  };

  const outputExt = resultFormat === "gif" ? "gif" : "mp4";
  const safePrefix = sanitizePrefix(prefix);
  const safeSuffix = sanitizeSuffix(effectiveSuffix);
  const fileNameOf = (index: number) => `${safePrefix}_${index + 1}${safeSuffix}.${outputExt}`;

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const downloadOne = (item: SplitResult) => {
    downloadBlob(item.blob, fileNameOf(item.index));
  };

  const packAndDownload = async (items: SplitResult[], mode: "all" | "selected") => {
    if (items.length === 0) return;
    setPacking(mode);
    try {
      const zip = new JSZip();
      for (const item of items) zip.file(fileNameOf(item.index), item.blob);
      downloadBlob(
        await zip.generateAsync({ type: "blob" }),
        `${safePrefix}_表情包${safeSuffix}.zip`,
      );
      toast.success(`已打包下载 ${items.length} 个表情包`);
    } catch {
      toast.error("打包下载失败，请重试");
    } finally {
      setPacking("none");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:flex-row md:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-lg">
            <div className="space-y-1.5">
              <Label htmlFor="prefix" className="text-sm font-medium">
                文件名前缀
              </Label>
              <Input
                id="prefix"
                className="h-10 w-full px-2.5 font-mono text-sm"
                value={prefix}
                maxLength={MAX_PREFIX_LENGTH}
                placeholder={DEFAULT_PREFIX}
                onChange={(e) => onPrefixChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suffix" className="text-sm font-medium">
                文件名后缀 <span className="text-xs font-normal text-muted-foreground">(可选)</span>
              </Label>
              <Input
                id="suffix"
                className="h-10 w-full px-2.5 font-mono text-sm"
                value={effectiveSuffix}
                maxLength={MAX_PREFIX_LENGTH}
                placeholder="如 _hd 或 -wx"
                onChange={(e) => handleSuffixChange(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            文件命名预览：<span className="font-mono font-medium text-foreground">{fileNameOf(0)}</span>
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <Button
            type="button"
            className="h-10 font-bold sticker-shadow-primary transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none md:w-36"
            disabled={packing !== "none"}
            onClick={() => void packAndDownload(results, "all")}
          >
            {packing === "all" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Package className="size-4" />
            )}
            {packing === "all" ? "打包中…" : "全部下载"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 md:w-40"
            disabled={packing !== "none" || selected.size === 0}
            onClick={() =>
              void packAndDownload(
                results.filter((item) => selected.has(item.index)),
                "selected",
              )
            }
          >
            {packing === "selected" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Package className="size-4" />
            )}
            {packing === "selected" ? "打包中…" : `下载所选(${selected.size})`}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {results.map((item) => (
          <div
            key={item.index}
            className="flex h-full animate-fade-in flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:sticker-shadow-sm"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Checkbox
                aria-label={`选择第 ${item.index + 1} 个`}
                checked={selected.has(item.index)}
                onCheckedChange={() => toggle(item.index)}
              />
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                #{item.index + 1}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {fileNameOf(item.index)}
              </span>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/50 p-2">
              {resultFormat === "gif" ? (
                <img
                  src={item.url}
                  alt={`第 ${item.index + 1} 个表情包预览`}
                  className="max-h-56 w-auto max-w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <video
                  src={item.url}
                  className="max-h-56 w-auto max-w-full object-contain"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              )}
            </div>

            <div className="mt-auto p-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => downloadOne(item)}
              >
                <Download className="size-4" />
                下载
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}