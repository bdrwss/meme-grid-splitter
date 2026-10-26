import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { LoaderCircle, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { FilePlay } from "@/components/icons/file-play";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSupportedVideo, MAX_FILE_SIZE, VIDEO_EXTENSIONS } from "@/lib/video";

interface UploadCardProps {
  onFile: (file: File) => void;
  onLoadSample?: () => void;
  sampleLoading?: boolean;
  disabled?: boolean;
}

/** 上传视频拖拽区（等价于原站产物中的 fp） */
export function UploadCard({ onFile, onLoadSample, sampleLoading, disabled }: UploadCardProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;

      if (!isSupportedVideo(file)) {
        toast.error(
          `暂不支持该格式，请上传 ${VIDEO_EXTENSIONS.slice(0, 5).join(" / ")} 等常见视频或动图文件`,
        );
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error("文件过大（超过 1GB），请先压缩后再上传");
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: disabled || sampleLoading,
    multiple: false,
    noClick: disabled || sampleLoading,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "dot-grid flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border bg-muted/40 p-8 text-center transition-colors",
        "cursor-pointer hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragActive && "border-primary bg-primary/5",
        (disabled || sampleLoading) && "pointer-events-none opacity-60",
      )}
    >
      <input {...getInputProps()} />
      <div className="flex size-16 items-center justify-center rounded-lg border-2 border-foreground bg-card sticker-shadow-sm">
        <Upload className="size-7 text-primary" strokeWidth={2.5} />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">
          {isDragActive ? "松开即可载入文件" : "点击选择或拖拽视频到此处"}
        </p>
        <p className="text-sm text-muted-foreground">支持 mp4、mov、webm、mkv、gif 等格式</p>
      </div>
      {onLoadSample && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || sampleLoading}
            className="border-2 border-primary/40 bg-primary/10 font-bold text-primary sticker-shadow-sm hover:border-primary hover:bg-primary/20 hover:text-primary active:translate-x-0.5 active:translate-y-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onLoadSample();
            }}
          >
            {sampleLoading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            快速体验：使用示例视频
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FilePlay className="size-3.5" />
        <span>最大 1GB · 视频仅在本机处理，不会上传服务器</span>
      </div>
    </div>
  );
}