import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { E3Button, E3Progress } from "@/components/e3";
import { ACCEPT_MEDIA, collectUploadableFiles, uploadLimitsHint } from "@/lib/media-file";
import { assessTvVideoCompat, MEDIA_LIBRARY_CODEC_HINT, tvVideoUploadWarning } from "@/lib/video-codec-hint";
import { cn } from "@/lib/utils";

interface PendingUpload {
  id: string;
  name: string;
  progress: number;
}

export function UploadDropzone({
  onUpload,
  hint,
  disabled,
}: {
  onUpload: (
    files: File[],
    onProgress: (fileName: string, percent: number) => void,
  ) => Promise<void>;
  hint?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const uploading = pending.length > 0;
  const busy = uploading || Boolean(disabled);

  async function startUpload(files: File[]) {
    if (files.length === 0) return;
    if (busy) {
      if (disabled) {
        toast.error("Wait until this folder is removed before uploading.");
      }
      return;
    }
    const { accepted, errors } = collectUploadableFiles(files);
    for (const message of errors) toast.error(message);
    if (accepted.length === 0) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    for (const file of accepted) {
      const compat = await assessTvVideoCompat(file);
      const warning = tvVideoUploadWarning(file.name, compat);
      if (warning) toast.warning(warning);
    }
    const batch = accepted.map((file, index) => ({
      id: `${index}:${file.name}:${file.size}:${file.lastModified}`,
      name: file.name,
      progress: 0,
    }));
    const batchIds = new Set(batch.map((item) => item.id));
    setPending(batch);
    try {
      await onUpload(accepted, (fileName, percent) => {
        setPending((prev) => {
          const index = prev.findIndex((item) => item.name === fileName && item.progress < 100);
          if (percent >= 100) {
            if (index < 0) return prev.filter((item) => item.name !== fileName);
            return prev.filter((_, i) => i !== index);
          }
          if (index < 0) {
            return prev.map((item) => (item.name === fileName ? { ...item, progress: percent } : item));
          }
          return prev.map((item, i) => (i === index ? { ...item, progress: percent } : item));
        });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending((prev) => prev.filter((item) => !batchIds.has(item.id)));
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void startUpload(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "rounded-2xl bg-card/60 px-6 py-12 text-center transition-colors",
          dragging ? "e3-gradient-border bg-card" : "border border-dashed border-border",
        )}
      >
        <UploadCloud className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <p className="font-display mt-4 text-lg font-semibold uppercase tracking-wide">
          Drop media here
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{hint ?? "Video · Image · Promotional Media"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{uploadLimitsHint()}</p>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-amber-700/90 dark:text-amber-400/90">
          {MEDIA_LIBRARY_CODEC_HINT}
        </p>
        <E3Button
          className="mt-5"
          variant="primary"
          disabled={busy}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          Browse Files
        </E3Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_MEDIA}
          className="sr-only"
          aria-label="Choose media files"
          onChange={(e) => void startUpload(Array.from(e.target.files ?? []))}
        />
      </div>

      {pending.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          {pending.map((p) => (
            <E3Progress
              key={p.id}
              value={p.progress}
              label={p.progress === 0 ? `Preparing ${p.name}` : p.name}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
