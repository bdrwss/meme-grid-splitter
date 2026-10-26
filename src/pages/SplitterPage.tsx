import { useMemo, useRef, useState } from "react";
import { CircleX, Film, RefreshCw, Scissors, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/Section";
import { UploadCard } from "@/components/UploadCard";
import { PreviewCanvas } from "@/components/PreviewCanvas";
import { LinePanel } from "@/components/LinePanel";
import { CutPanel, type CutPhase } from "@/components/CutPanel";
import { HistoryDialog } from "@/components/HistoryDialog";
import { terminateFFmpeg } from "@/lib/engine";
import {
  buildRects,
  cellCount,
  DEFAULT_LINES,
  getEqualLines,
  type GridPreset,
  suggestNextLine,
} from "@/lib/geometry";
import { runSplit, type ExportFormat, type SplitProgress, type SplitResult } from "@/lib/split";
import { ACCEPT_ATTR, getAspectRatioLabel, probeMedia, type MediaInfo } from "@/lib/video";
import { formatBytes } from "@/lib/utils";

/** 主页面：上传 → 设置切割线 → 执行切割 → 下载导出（等价于原站产物中的 vp） */
export function SplitterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [hLines, setHLines] = useState<number[]>(DEFAULT_LINES);
  const [vLines, setVLines] = useState<number[]>(DEFAULT_LINES);
  const [phase, setPhase] = useState<CutPhase>("idle");
  const [engineMsg, setEngineMsg] = useState("");
  const [progress, setProgress] = useState<SplitProgress>({ done: 0, total: 0, ratio: 0 });
  const [results, setResults] = useState<SplitResult[]>([]);
  const [resultFormat, setResultFormat] = useState<ExportFormat>("gif");
  const [format, setFormat] = useState<ExportFormat>("gif");
  const [gifFps, setGifFps] = useState<number>(12);
  const [videoBitrate, setVideoBitrate] = useState<number>(4.0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [keepAudio, setKeepAudio] = useState<boolean>(false);
  const [targetDuration, setTargetDuration] = useState<number>(0);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [prefix, setPrefix] = useState("表情包");
  const [suffix, setSuffix] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hoveredPreset, setHoveredPreset] = useState<GridPreset | null>(null);
  const [showLabels, setShowLabels] = useState(true);

  const previewUrlRef = useRef("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const abortRef = useRef({ aborted: false });

  const busy = phase === "engine" || phase === "cutting";
  const cellTotal = useMemo(() => cellCount(hLines.length, vLines.length), [hLines, vLines]);

  const clearResults = () => {
    setResults((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.url);
      return [];
    });
  };

  const loadFile = async (next: File) => {
    try {
      const probed = await probeMedia(next);
      if (probed.width < 4 || probed.height < 4) throw new Error("画面尺寸过小，无法切割");

      clearResults();
      setPhase("idle");
      setProgress({ done: 0, total: 0, ratio: 0 });
      setHLines(DEFAULT_LINES);
      setVLines(DEFAULT_LINES);
      setStartTime(0);
      setEndTime(Number((probed.duration || 0).toFixed(2)));
      setKeepAudio(false);
      setCurrentVideoTime(0);
      setFile(next);
      setInfo(probed);

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(next);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文件解析失败，请更换文件重试");
    }
  };

  const handleLoadSample = async () => {
    if (sampleLoading || busy) return;
    setSampleLoading(true);
    try {
      const baseUrl =
        (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";
      const sampleUrl = new URL(`${baseUrl}demo/sample-meme.mp4`, window.location.href).href;
      const res = await fetch(sampleUrl);
      if (!res.ok) {
        throw new Error(`无法获取示例视频（HTTP ${res.status}）`);
      }
      const blob = await res.blob();
      const sampleFile = new File([blob], "示例九宫格.mp4", { type: "video/mp4" });
      await loadFile(sampleFile);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载示例视频失败，请重试");
    } finally {
      setSampleLoading(false);
    }
  };

  const handleReplaceInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (busy) {
      pendingFileRef.current = picked;
      setConfirmOpen(true);
      return;
    }
    void loadFile(picked);
  };

  const confirmReplace = (next: File) => {
    abortRef.current.aborted = true;
    terminateFFmpeg();
    setPhase("idle");
    void loadFile(next);
  };

  const changeLine = (axis: "h" | "v", index: number, value: number) => {
    if (axis === "h") setHLines((prev) => prev.map((item, i) => (i === index ? value : item)));
    else setVLines((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const removeLine = (axis: "h" | "v", index: number) => {
    if (axis === "h") setHLines((prev) => prev.filter((_, i) => i !== index));
    else setVLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleResetGrid = () => {
    const rows = hLines.length + 1;
    const cols = vLines.length + 1;
    setHLines(getEqualLines(rows));
    setVLines(getEqualLines(cols));
    toast.success("网格已恢复为均匀分布");
  };

  const handlePickCurrentFrame = () => {
    const clamped = Math.max(0, Number(currentVideoTime.toFixed(2)));
    setStartTime(clamped);
    toast.success(`已将当前播放帧 (${clamped}s) 设为起始时间`);
  };

  const startCut = async () => {
    if (!file || !info) return;

    if (endTime > 0 && startTime >= endTime) {
      toast.error("起始时间不能大于或等于结束时间");
      return;
    }

    const rects = buildRects(hLines, vLines, info.width, info.height);
    if (rects.some((rect) => rect.w < 2 || rect.h < 2)) {
      toast.error("存在过小的格子（宽或高不足 2 像素），请调整切割线位置");
      return;
    }

    abortRef.current = { aborted: false };
    clearResults();
    setPhase("engine");
    setEngineMsg("");
    setProgress({ done: 0, total: rects.length, ratio: 0 });

    // 片段原始时长：未指定结束时间时算到片尾（GIF 输入读不到时长，传 0 让引擎自行探测）
    const sourceDuration = Math.max(
      0,
      (endTime > 0 ? endTime : info.duration || 0) - startTime,
    );

    try {
      const produced = await runSplit({
        file,
        rects,
        format,
        gifFps,
        videoBitrate,
        startTime,
        endTime: endTime > 0 ? endTime : undefined,
        keepAudio,
        targetDuration,
        sourceDuration,
        onEngineStatus: setEngineMsg,
        onNotice: (message) => toast.warning(message),
        onProgress: (next) => {
          setProgress(next);
          setPhase((prev) => (prev === "engine" ? "cutting" : prev));
        },
        abortRef: abortRef.current,
      });
      setResults(produced);
      setResultFormat(format);
      setPhase("done");
      setHistoryOpen(true);
      toast.success(`切割完成，共生成 ${produced.length} 个表情包`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.name === "AbortError" || error.message.includes("terminate")) {
        toast.info("已取消切割");
      } else {
        toast.error(`切割失败：${error.message || "请重试或减少切割数量"}`);
      }
      setPhase("idle");
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-card sticker-shadow-sm">
              <Scissors className="size-5 text-primary" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-display text-xl leading-tight text-foreground md:text-2xl">
                九宫格表情包切割器
              </h1>
              <p className="text-xs text-muted-foreground">
                把多宫格动图视频拆成一个个独立表情包
              </p>
            </div>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            视频仅在本机处理，不上传服务器
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-4 py-8">
        {!file && (
          <Section index={1} title="上传视频" desc="支持 mp4 / mov / webm / mkv / gif">
            <UploadCard
              onFile={(next) => void loadFile(next)}
              onLoadSample={handleLoadSample}
              sampleLoading={sampleLoading}
              disabled={busy}
            />
          </Section>
        )}

        {file && info && (
          <Section
            index={1}
            title="设置切割并执行"
            desc="调整切割线与导出格式后，即可开始本地切割"
            action={
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 gap-1.5 border-border font-bold sticker-shadow-sm transition-all hover:translate-x-0.5 hover:translate-y-0.5 active:translate-x-1 active:translate-y-1"
                >
                  <RefreshCw className="size-3.5 text-muted-foreground" />
                  更换视频
                </Button>
                {busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-destructive font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      abortRef.current.aborted = true;
                      terminateFFmpeg();
                    }}
                  >
                    <CircleX className="mr-1.5 size-4" />
                    取消切割
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 px-4 font-bold sticker-shadow-primary transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none active:translate-x-1 active:translate-y-1"
                    disabled={!file || !info}
                    onClick={() => void startCut()}
                  >
                    <Scissors className="mr-1.5 size-4" />
                    {phase === "done" ? "重新切割" : "开始切割"}
                  </Button>
                )}
              </div>
            }
          >
            <div className="space-y-6">
              <div className="flex flex-col gap-6 md:flex-row">
                <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4">
                  <PreviewCanvas
                    url={previewUrl}
                    info={info}
                    fileName={file.name}
                    fileSize={file.size}
                    hLines={hLines}
                    vLines={vLines}
                    onHChange={(index, value) => changeLine("h", index, value)}
                    onVChange={(index, value) => changeLine("v", index, value)}
                    onResetGrid={handleResetGrid}
                    showLabels={showLabels}
                    onToggleLabels={() => setShowLabels((prev) => !prev)}
                    onTimeChange={setCurrentVideoTime}
                    onOpenHistory={() => {
                      if (results.length === 0) {
                        toast.info("暂无历史切割结果，请先开始切割");
                      }
                      setHistoryOpen(true);
                    }}
                    historyCount={results.length}
                    previewPreset={hoveredPreset}
                    disabled={busy}
                  />
                </div>
                <div className="w-full shrink-0 md:w-80">
                  <LinePanel
                    info={info}
                    hLines={hLines}
                    vLines={vLines}
                    onHChange={(index, value) => changeLine("h", index, value)}
                    onVChange={(index, value) => changeLine("v", index, value)}
                    onHAdd={() => setHLines(suggestNextLine)}
                    onVAdd={() => setVLines(suggestNextLine)}
                    onHRemove={(index) => removeLine("h", index)}
                    onVRemove={(index) => removeLine("v", index)}
                    onApplyPreset={(h, v) => {
                      setHLines(h);
                      setVLines(v);
                    }}
                    onHoverPreset={setHoveredPreset}
                    format={format}
                    onFormatChange={setFormat}
                    gifFps={gifFps}
                    onGifFpsChange={setGifFps}
                    videoBitrate={videoBitrate}
                    onVideoBitrateChange={setVideoBitrate}
                    startTime={startTime}
                    endTime={endTime}
                    onStartTimeChange={setStartTime}
                    onEndTimeChange={setEndTime}
                    onPickCurrentFrame={handlePickCurrentFrame}
                    keepAudio={keepAudio}
                    onKeepAudioChange={setKeepAudio}
                    targetDuration={targetDuration}
                    onTargetDurationChange={setTargetDuration}
                    disabled={busy}
                  />
                </div>
              </div>
            </div>
          </Section>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={handleReplaceInputChange}
        />

        {/* 独立切割进度弹窗：切割时展示，切割结束时自动消失 */}
        <CutPanel
          open={busy}
          phase={phase}
          engineMsg={engineMsg}
          progress={progress}
          cellCount={cellTotal}
          format={format}
          onCancel={() => {
            abortRef.current.aborted = true;
            terminateFFmpeg();
          }}
        />

        <HistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          results={results}
          resultFormat={resultFormat}
          prefix={prefix}
          onPrefixChange={setPrefix}
          suffix={suffix}
          onSuffixChange={setSuffix}
          canReCut={Boolean(file && info)}
          busy={busy}
          onReCut={() => void startCut()}
        />
      </main>

      <footer className="border-t border-border bg-card">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground">
          所有处理均在您的浏览器本地完成（ffmpeg.wasm），视频不会离开这台设备
        </p>
      </footer>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>中断当前切割并更换视频？</AlertDialogTitle>
            <AlertDialogDescription>
              更换视频将中断正在进行的切割并清空已产出的结果，确定继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续切割</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = pendingFileRef.current;
                pendingFileRef.current = null;
                if (next) confirmReplace(next);
              }}
            >
              确认更换
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}