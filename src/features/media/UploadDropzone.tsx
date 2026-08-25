import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { E3Button, E3Progress } from "@/components/e3";
import { cn } from "@/lib/utils";
import type { Media } from "@/types";

interface PendingUpload {
  name: string;
  progress: number;
}

export function UploadDropzone({
  onComplete,
}: {
  onComplete: (files: Array<{ name: string; sizeMb: number; type: Media["type"] }>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);

  function startMockUpload(files: File[]) {
    if (files.length === 0) return;
    setPending(files.map((f) => ({ name: f.name, progress: 0 })));

    let tick = 0;
    const timer = setInterval(() => {
      tick += 12;
      setPending((prev) => prev.map((p) => ({ ...p, progress: Math.min(100, tick) })));
      if (tick >= 100) {
        clearInterval(timer);
        setTimeout(() => {
          setPending([]);
          onComplete(
            files.map((f) => ({
              name: f.name,
              sizeMb: Number((f.size / 1_000_000).toFixed(1)) || 1.2,
              type: f.type.startsWith("video") ? "Video" : "Image",
            })),
          );
        }, 350);
      }
    }, 180);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          startMockUpload(Array.from(e.dataTransfer.files));
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
        <p className="mt-1 text-sm text-muted-foreground">Video · Image · Promotional Media</p>
        <E3Button className="mt-5" variant="primary" onClick={() => inputRef.current?.click()}>
          Browse Files
        </E3Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="sr-only"
          aria-label="Choose media files"
          onChange={(e) => startMockUpload(Array.from(e.target.files ?? []))}
        />
      </div>

      {pending.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          {pending.map((p) => (
            <E3Progress key={p.name} value={p.progress} label={p.name} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
