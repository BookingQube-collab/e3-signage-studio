import { Loader2, Music2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { playlistMp3Error } from "@/lib/media-file";
import { cn } from "@/lib/utils";
import { mediaService } from "@/services";
import type { PlaylistItem } from "@/types";

export function PlaylistItemAudioControl({
  item,
  disabled,
  onChange,
}: {
  item: PlaylistItem;
  disabled?: boolean;
  onChange: (patch: Pick<PlaylistItem, "audioMediaId" | "audioFilename" | "audioUrl">) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const attached = Boolean(item.audioMediaId && item.audioFilename);

  async function attachFile(file: File) {
    const error = playlistMp3Error(file);
    if (error) {
      toast.error(error);
      return;
    }
    setUploading(true);
    try {
      const result = await mediaService.upload([file]);
      const uploaded = result.uploaded[0];
      const failed = result.failed[0];
      if (!uploaded) {
        toast.error(failed?.message || "Could not upload that MP3.");
        return;
      }
      let audioUrl = uploaded.previewUrl ?? uploaded.thumbnailUrl ?? null;
      if (!audioUrl) {
        try {
          const fresh = await mediaService.downloadUrl(uploaded.id);
          audioUrl = fresh.url || null;
        } catch {
          audioUrl = null;
        }
      }
      onChange({
        audioMediaId: uploaded.id,
        audioFilename: uploaded.filename,
        audioUrl,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload that MP3.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void attachFile(file);
        }}
      />
      <button
        type="button"
        aria-label={
          attached
            ? `Replace MP3 for ${item.filename}`
            : `Add optional MP3 for ${item.filename}`
        }
        title={attached ? "Replace MP3" : "Optional MP3"}
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background/60",
          attached ? "text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          (disabled || uploading) && "pointer-events-none opacity-50",
        )}
      >
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Music2 className="size-4" />}
      </button>
      {attached ? (
        <span className="flex min-w-0 max-w-[9.5rem] items-center gap-1 rounded-lg border border-border bg-background/60 px-2 py-1">
          <span className="truncate text-xs text-foreground" title={item.audioFilename ?? undefined}>
            {item.audioFilename}
          </span>
          <button
            type="button"
            aria-label={`Remove MP3 from ${item.filename}`}
            disabled={disabled || uploading}
            onClick={() =>
              onChange({ audioMediaId: null, audioFilename: null, audioUrl: null })
            }
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ) : null}
    </div>
  );
}
