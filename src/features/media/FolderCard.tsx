import { Folder } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MediaFolder } from "@/types";

export function FolderCard({
  folder,
  onOpen,
  size = "default",
}: {
  folder: MediaFolder;
  onOpen: (folder: MediaFolder) => void;
  size?: "default" | "picker";
}) {
  const files = folder.fileCount === 1 ? "1 file" : `${folder.fileCount} files`;
  return (
    <button
      type="button"
      onClick={() => onOpen(folder)}
      className={cn(
        "group flex w-full flex-col rounded-2xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-e3-purple/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div
        className={cn(
          "grid w-full place-items-center rounded-xl bg-muted",
          size === "picker" ? "aspect-[4/3] min-h-[140px]" : "aspect-video",
        )}
      >
        <Folder className={cn("text-e3-purple", size === "picker" ? "size-12" : "size-8")} aria-hidden />
      </div>
      <p className="mt-3 truncate text-sm font-medium">{folder.name}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{files}</p>
    </button>
  );
}
