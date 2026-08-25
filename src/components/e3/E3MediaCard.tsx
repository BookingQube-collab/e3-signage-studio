import { FileImage, PlayCircle, QrCode, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Media } from "@/types";

const iconFor = {
  Video: PlayCircle,
  Image: FileImage,
  QR: QrCode,
  Logo: Sparkles,
} as const;

export function MediaThumb({ item, className }: { item: Media; className?: string }) {
  const Icon = iconFor[item.type];
  return (
    <div
      className={cn("grid place-items-center overflow-hidden rounded-xl bg-muted", className)}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${item.thumbnailHue} 55% 22%), hsl(${
          (item.thumbnailHue + 60) % 360
        } 45% 14%))`,
      }}
      aria-hidden
    >
      <Icon className="size-7 text-foreground/70" />
    </div>
  );
}

export function E3MediaCard({
  item,
  view = "grid",
  onOpen,
  selected,
}: {
  item: Media;
  view?: "grid" | "list";
  onOpen?: (item: Media) => void;
  selected?: boolean;
}) {
  const meta = [item.dimensions, item.durationSec ? `${item.durationSec}s` : null, `${item.sizeMb.toFixed(1)} MB`]
    .filter(Boolean)
    .join(" · ");

  if (view === "list") {
    return (
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected && "e3-gradient-border border-0",
        )}
      >
        <MediaThumb item={item} className="size-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.filename}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.type} · {meta}
          </p>
        </div>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {item.modifiedAt}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className={cn(
        "group flex w-full flex-col rounded-2xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-e3-purple/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "e3-gradient-border border-0",
      )}
    >
      <MediaThumb item={item} className="aspect-video w-full" />
      <p className="mt-3 truncate text-sm font-medium">{item.filename}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.type} · {meta}</p>
    </button>
  );
}
