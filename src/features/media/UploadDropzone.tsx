import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { E3Button, E3Progress } from "@/components/e3";
import { ACCEPT_MEDIA, collectUploadableFiles, uploadLimitsHint } from "@/lib/media-file";
import { cn } from "@/lib/utils";

interface PendingUpload {
  name: string;
  progress: number;
}

export function UploadDropzone({
  onUpload,
  hint,
}: {
  onUpload: (
    files: File[],
    onProgress: (fileName: string, percent: number) => void,
  ) => Promise<void>;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const busy = pending.length > 0;

  async function startUpload(files: File[]) {
    if (files.length === 0 || busy) return;
    const { accepted, errors } = collectUploadableFiles(files);
    for (const message of errors) toast.error(message);
    if (accepted.length === 0) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setPending(accepted.map((file) => ({ name: file.name, progress: 0 })));
    try {
      await onUpload(accepted, (fileName, percent) => {
        setPending((prev) =>
          prev.map((item) => (item.name === fileName ? { ...item, progress: percent } : item)),
        );
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending([]);
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
        <E3Button
          className="mt-5"
          variant="primary"
          disabled={busy}
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
              key={p.name}
              value={p.progress}
              label={p.progress === 0 ? `Preparing ${p.name}` : p.name}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
