import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useDebouncedValue } from "@/lib/use-debounced-value";

import { E3EmptyState, E3MediaCard } from "@/components/e3";
import { Input } from "@/components/ui/input";
import { FolderCard } from "@/features/media/FolderCard";
import {
  folderCardLabel,
  foldersInLibraryView,
  libraryViewFor,
  mediaInLibraryView,
} from "@/lib/media-folders";
import { cn } from "@/lib/utils";
import type { Media, MediaFolder } from "@/types";

export function MediaPicker({
  media,
  folders,
  onPick,
  selectedIds,
  draggable,
  className,
}: {
  media: Media[];
  folders: MediaFolder[];
  onPick: (item: Media) => void;
  selectedIds?: Set<string>;
  draggable?: boolean;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [folderId, setFolderId] = useState<string | null>(null);
  const current = folders.find((folder) => folder.id === folderId) ?? null;
  const view = libraryViewFor(debouncedSearch, folderId);
  const searching = view.mode === "search";

  const visibleFolders = useMemo(
    () => foldersInLibraryView(folders, view),
    [folders, view],
  );
  const visibleMedia = useMemo(() => mediaInLibraryView(media, view), [media, view]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search media"
          aria-label="Search media"
          className="pl-9"
        />
      </div>

      {current && !searching ? (
        <nav className="text-sm text-muted-foreground" aria-label="Folder">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => setFolderId(null)}
          >
            Library
          </button>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{current.name}</span>
        </nav>
      ) : null}

      {visibleFolders.length === 0 && visibleMedia.length === 0 ? (
        <E3EmptyState
          title={searching ? "No matching media" : current ? "This folder is empty" : "No media yet"}
          description={
            searching
              ? "Try another filename, or open a folder."
              : "Upload files in the Media Library, then pick them here."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibleFolders.map((folder) => (
            <FolderCard key={folder.id} folder={folder} size="picker" onOpen={(f) => setFolderId(f.id)} />
          ))}
          {visibleMedia.map((item) => (
            <div
              key={item.id}
              draggable={draggable}
              onDragStart={
                draggable
                  ? (e) => {
                      e.dataTransfer.setData("text/plain", item.filename);
                      e.dataTransfer.setData("application/x-e3-media-id", item.id);
                    }
                  : undefined
              }
            >
              <E3MediaCard
                item={item}
                size="picker"
                folderLabel={folderCardLabel(item.folderName, searching)}
                selected={selectedIds?.has(item.id)}
                onOpen={onPick}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
