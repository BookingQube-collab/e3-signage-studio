import { FileImage, FolderInput, MoreVertical, PlayCircle, QrCode, Sparkles } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      {item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
      ) : (
        <Icon className="size-7 text-foreground/70" />
      )}
    </div>
  );
}

export function E3MediaCard({
  item,
  view = "grid",
  size = "default",
  onOpen,
  selected,
  folderLabel,
  onMove,
}: {
  item: Media;
  view?: "grid" | "list";
  size?: "default" | "picker";
  onOpen?: (item: Media) => void;
  selected?: boolean;
  folderLabel?: string | null;
  onMove?: (item: Media) => void;
}) {
  const meta = [item.dimensions, item.durationSec ? `${item.durationSec}s` : null, `${item.sizeMb.toFixed(1)} MB`]
    .filter(Boolean)
    .join(" · ");
  const picker = size === "picker";

  if (view === "list") {
    return (
      <div
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50",
          selected && "e3-gradient-border border-0",
        )}
      >
        <button
          type="button"
          onClick={() => onOpen?.(item)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MediaThumb item={item} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.filename}</p>
            <p className="truncate text-xs text-muted-foreground">
              {folderLabel ? `${folderLabel} · ` : ""}
              {item.type} · {meta}
            </p>
          </div>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            {item.modifiedAt}
          </span>
        </button>
        {onMove ? <MoveMenu item={item} onMove={onMove} /> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex w-full flex-col rounded-2xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-e3-purple/40",
        selected && "e3-gradient-border border-0",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        className="flex w-full flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MediaThumb
          item={item}
          className={picker ? "aspect-[4/3] min-h-[140px] w-full" : "aspect-video w-full"}
        />
        <p className="mt-3 truncate text-sm font-medium">{item.filename}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {folderLabel ? `${folderLabel} · ` : ""}
          {picker ? item.type : `${item.type} · ${meta}`}
        </p>
      </button>
      {onMove ? (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <MoveMenu item={item} onMove={onMove} />
        </div>
      ) : null}
    </div>
  );
}

function MoveMenu({ item, onMove }: { item: Media; onMove: (item: Media) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${item.filename}`}
          className="grid size-8 place-items-center rounded-lg border border-border bg-card/90 text-muted-foreground hover:text-foreground"
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => onMove(item)}>
          <FolderInput />
          Move to folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
