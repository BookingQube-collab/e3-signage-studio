import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderPlus, Image as ImageIcon, LayoutGrid, List, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";

import {
  E3Alert,
  E3Button,
  E3Card,
  E3CardBody,
  E3EmptyState,
  E3MediaCard,
  E3Modal,
  E3PageHeader,
  E3QueryBoundary,
  MediaThumb,
} from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BulkToolbar } from "@/features/media/BulkToolbar";
import { FolderCard } from "@/features/media/FolderCard";
import { UploadDropzone } from "@/features/media/UploadDropzone";
import {
  applySelectionClick,
  inUseDeleteMessage,
  partitionBulkDelete,
  selectAllIds,
} from "@/lib/media-bulk";
import { ACCEPT_MEDIA } from "@/lib/media-file";
import {
  folderCardLabel,
  foldersInLibraryView,
  libraryViewFor,
  mediaInLibraryView,
  resolveUploadFolderId,
} from "@/lib/media-folders";
import { cn } from "@/lib/utils";
import { mediaService } from "@/services";
import type { Media, MediaFolder } from "@/types";

export const Route = createFileRoute("/_shell/media")({
  head: () => ({
    meta: [
      { title: "Media Library — E3 Digital Signage" },
      {
        name: "description",
        content: "Upload and organise videos, images, QR codes and logos for E3 screens.",
      },
      { property: "og:title", content: "Media Library — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Upload and organise videos, images, QR codes and logos for E3 screens.",
      },
    ],
  }),
  component: MediaPage,
});

const FILTERS = ["All", "Videos", "Images", "QR", "Recently Added"] as const;
const UNFILED_VALUE = "__unfiled";

function MediaPage() {
  const qc = useQueryClient();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Media | null>(null);
  const [renaming, setRenaming] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveIds, setMoveIds] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState(UNFILED_VALUE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const mediaQuery = useQuery({ queryKey: ["media"], queryFn: mediaService.list });
  const foldersQuery = useQuery({ queryKey: ["media-folders"], queryFn: mediaService.listFolders });

  const folders = foldersQuery.data ?? [];
  const currentFolder = folders.find((folder) => folder.id === folderId) ?? null;
  const libraryView = libraryViewFor(search, folderId);
  const searching = libraryView.mode === "search";

  const upload = useMutation({
    mutationFn: ({
      files,
      onProgress,
    }: {
      files: File[];
      onProgress: (fileName: string, percent: number) => void;
    }) => mediaService.upload(files, onProgress, resolveUploadFolderId(folderId)),
    retry: 0,
    onSuccess: (added) => {
      toast.success(`${added.length} file${added.length > 1 ? "s" : ""} uploaded`);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      void qc.invalidateQueries({ queryKey: ["media-folders"] });
    },
  });

  const createFolder = useMutation({
    mutationFn: mediaService.createFolder,
    onSuccess: (folder) => {
      void qc.invalidateQueries({ queryKey: ["media-folders"] });
      setCreateOpen(false);
      setNewFolderName("");
      setFolderId(folder.id);
      toast.success(`${folder.name} created`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not create folder.");
    },
  });

  const deleteFolder = useMutation({
    mutationFn: mediaService.deleteFolder,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      void qc.invalidateQueries({ queryKey: ["media-folders"] });
      setFolderId(null);
      toast.success("Folder deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete folder.");
    },
  });

  const moveToFolder = useMutation({
    mutationFn: ({ ids, nextFolderId }: { ids: string[]; nextFolderId: string | null }) =>
      mediaService.moveManyToFolder(ids, nextFolderId),
    onSuccess: (moved) => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      void qc.invalidateQueries({ queryKey: ["media-folders"] });
      const first = moved[0];
      setSelected((prev) => (prev && moved.some((item) => item.id === prev.id) ? (moved.find((item) => item.id === prev.id) ?? prev) : prev));
      setMoveIds([]);
      clearSelection();
      const dest = first?.folderName;
      toast.success(
        moved.length === 1
          ? dest
            ? `Moved to ${dest}`
            : "Moved to Unfiled"
          : dest
            ? `Moved ${moved.length} files to ${dest}`
            : `Moved ${moved.length} files to Unfiled`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not move media.");
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      mediaService.rename(id, filename),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      setSelected(m);
      toast.success("Renamed");
    },
  });

  const replace = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => mediaService.replace(id, file),
    retry: 0,
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      setSelected(m);
      toast.success("New version uploaded");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Replace failed.");
    },
  });

  const archive = useMutation({
    mutationFn: mediaService.archive,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      void qc.invalidateQueries({ queryKey: ["media-folders"] });
      setSelected(null);
      toast.success("Archived");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not archive.");
    },
  });

  const remove = useMutation({
    mutationFn: mediaService.remove,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      void qc.invalidateQueries({ queryKey: ["media-folders"] });
      setSelected(null);
      toast.success("Media deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    },
  });

  const removeMany = useMutation({
    mutationFn: mediaService.removeMany,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      void qc.invalidateQueries({ queryKey: ["media-folders"] });
      setDeleteOpen(false);
      setSelected(null);
      clearSelection();
      toast.success("Media deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    },
  });

  const download = useMutation({
    mutationFn: mediaService.downloadUrl,
    onSuccess: ({ url, filename }) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Download failed.");
    },
  });

  const visibleFolders = useMemo(
    () => foldersInLibraryView(folders, libraryView),
    [folders, libraryView],
  );

  const items = useMemo(() => {
    const scoped = mediaInLibraryView(mediaQuery.data ?? [], libraryView);
    return scoped
      .filter((m) => {
        if (filter === "All" || filter === "Recently Added") return true;
        if (filter === "Videos") return m.type === "Video";
        if (filter === "Images") return m.type === "Image" || m.type === "Logo";
        return m.type === "QR";
      })
      .slice(0, filter === "Recently Added" ? 8 : undefined);
  }, [mediaQuery.data, libraryView, filter]);

  const visibleIds = useMemo(() => items.map((item) => item.id), [items]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const overlayOpen = createOpen || moveIds.length > 0 || Boolean(selected) || deleteOpen;
  const bulkPlan = partitionBulkDelete(mediaQuery.data ?? [], selectedIds);

  function clearSelection() {
    setSelectedIds(new Set());
    setAnchorId(null);
  }

  function openMove(item: Media) {
    setMoveIds([item.id]);
    setMoveTarget(item.folderId ?? UNFILED_VALUE);
  }

  function applyClick(id: string, mods: { toggle: boolean; range: boolean }) {
    const next = applySelectionClick(selectedIds, visibleIds, id, mods, anchorId);
    setSelectedIds(next.selected);
    setAnchorId(next.anchorId);
  }

  function handleOpenMedia(item: Media, event?: MouseEvent<HTMLButtonElement>) {
    if (event?.shiftKey) {
      event.preventDefault();
      applyClick(item.id, { toggle: event.metaKey || event.ctrlKey, range: true });
      return;
    }
    if (event && (event.metaKey || event.ctrlKey || selectedIds.size > 0)) {
      event.preventDefault();
      applyClick(item.id, { toggle: true, range: false });
      return;
    }
    setSelected(item);
    setRenaming(item.filename);
  }

  useEffect(() => {
    clearSelection();
  }, [folderId, search, filter]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (overlayOpen) return;
      clearSelection();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen]);

  const loading = mediaQuery.isLoading || foldersQuery.isLoading;
  const errored = mediaQuery.isError || foldersQuery.isError;
  const empty = visibleFolders.length === 0 && items.length === 0;
  const selectionActive = selectedIds.size > 0;
  const mediaBusy =
    rename.isPending || replace.isPending || download.isPending || archive.isPending || remove.isPending;

  return (
    <div>
      <E3PageHeader
        title={currentFolder && !searching ? currentFolder.name : "Media Library"}
        description={
          currentFolder && !searching
            ? "Files in this folder. Playlists can still pick them from anywhere."
            : "Everything available to playlists, layouts and campaigns."
        }
        breadcrumb={
          currentFolder && !searching ? (
            <span>
              <button type="button" className="hover:text-foreground" onClick={() => setFolderId(null)}>
                Media
              </button>
              <span className="mx-1.5">/</span>
              <span className="text-foreground">{currentFolder.name}</span>
            </span>
          ) : undefined
        }
        actions={
          <>
            {currentFolder && !searching ? (
              <E3Button
                variant="outline"
                loading={deleteFolder.isPending}
                onClick={() => deleteFolder.mutate(currentFolder.id)}
              >
                Delete folder
              </E3Button>
            ) : null}
            <E3Button variant="primary" onClick={() => setCreateOpen(true)}>
              <FolderPlus /> Create folder
            </E3Button>
          </>
        }
      />

      <div className="mb-6">
        <UploadDropzone
          hint={
            currentFolder && !searching
              ? `Uploads go into ${currentFolder.name}`
              : "Uploads stay in Unfiled until you move them"
          }
          onUpload={async (files, onProgress) => {
            await upload.mutateAsync({ files, onProgress });
          }}
        />
      </div>

      <E3Card className="mb-4">
        <E3CardBody className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
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
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  filter === f
                    ? "e3-gradient border-transparent text-white"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
            {items.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(selectAllIds(visibleIds));
                  setAnchorId(visibleIds[0] ?? null);
                }}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {allSelected ? "All selected" : "Select all"}
              </button>
            ) : null}
            <div className="flex overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                className={cn("grid size-9 place-items-center", view === "grid" && "bg-accent")}
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                className={cn("grid size-9 place-items-center", view === "list" && "bg-accent")}
              >
                <List className="size-4" />
              </button>
            </div>
          </div>
        </E3CardBody>
      </E3Card>

      <BulkToolbar
        count={selectedIds.size}
        visibleCount={visibleIds.length}
        allSelected={allSelected}
        onSelectAll={() => {
          setSelectedIds(selectAllIds(visibleIds));
          setAnchorId(visibleIds[0] ?? null);
        }}
        onClear={clearSelection}
        onMove={() => {
          setMoveIds([...selectedIds]);
          setMoveTarget(UNFILED_VALUE);
        }}
        onDelete={() => setDeleteOpen(true)}
        busy={moveToFolder.isPending || removeMany.isPending}
      />

      <E3QueryBoundary
        isLoading={loading}
        isError={errored}
        refetch={() => {
          void mediaQuery.refetch();
          void foldersQuery.refetch();
        }}
      >
        {empty ? (
          <E3EmptyState
            icon={ImageIcon}
            title={searching ? "No matching media" : currentFolder ? "This folder is empty" : "No media uploaded"}
            description={
              searching
                ? "Search looks across every folder."
                : currentFolder
                  ? "Drop a video or image above to add it here."
                  : "Create a folder for a venue or campaign, or drop files into Unfiled."
            }
            action={
              currentFolder ? undefined : (
                <E3Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <FolderPlus /> Create folder
                </E3Button>
              )
            }
          />
        ) : view === "grid" ? (
          <LibraryGrid
            folders={visibleFolders}
            items={items}
            searching={searching}
            selectedIds={selectedIds}
            selectionActive={selectionActive}
            showUnfiledHeading={!searching && !currentFolder && items.length > 0 && visibleFolders.length > 0}
            onBackgroundClick={clearSelection}
            onOpenFolder={(folder) => {
              setFolderId(folder.id);
              setSearch("");
            }}
            onOpenMedia={handleOpenMedia}
            onToggle={(item, event) =>
              applyClick(item.id, { toggle: true, range: event.shiftKey })
            }
            onMove={openMove}
          />
        ) : (
          <div
            className="space-y-2"
            onClick={(event) => {
              if (!(event.target instanceof Element) || event.target.closest("[data-media-card]")) return;
              clearSelection();
            }}
          >
            {items.map((m) => (
              <E3MediaCard
                key={m.id}
                item={m}
                view="list"
                selectable
                checked={selectedIds.has(m.id)}
                selectionActive={selectionActive}
                folderLabel={folderCardLabel(m.folderName, searching || Boolean(m.folderName))}
                onMove={openMove}
                onToggle={(item, event) => applyClick(item.id, { toggle: true, range: event.shiftKey })}
                onOpen={handleOpenMedia}
              />
            ))}
          </div>
        )}
      </E3QueryBoundary>

      <E3Modal
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && createFolder.isPending) return;
          setCreateOpen(open);
        }}
        title="Create folder"
        description="One level — name it after a venue, campaign, or event."
        footer={
          <>
            <E3Button variant="outline" disabled={createFolder.isPending} onClick={() => setCreateOpen(false)}>
              Cancel
            </E3Button>
            <E3Button
              variant="primary"
              loading={createFolder.isPending}
              disabled={!newFolderName.trim()}
              onClick={() => createFolder.mutate(newFolderName)}
            >
              Create folder
            </E3Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="folder-name">Folder name</Label>
          <Input
            id="folder-name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="e.g. InflataPark, Rajan Office, Birthday - Poppy"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim() && !createFolder.isPending) {
                createFolder.mutate(newFolderName);
              }
            }}
          />
        </div>
      </E3Modal>

      <E3Modal
        open={moveIds.length > 0}
        onOpenChange={(o) => {
          if (!o && moveToFolder.isPending) return;
          if (!o) setMoveIds([]);
        }}
        title={moveIds.length > 1 ? `Move ${moveIds.length} files` : "Move to folder"}
        description="Organization only — playlists keep using these files."
        footer={
          <>
            <E3Button variant="outline" disabled={moveToFolder.isPending} onClick={() => setMoveIds([])}>
              Cancel
            </E3Button>
            <E3Button
              variant="primary"
              loading={moveToFolder.isPending}
              disabled={moveIds.length === 0}
              onClick={() =>
                moveToFolder.mutate({
                  ids: moveIds,
                  nextFolderId: moveTarget === UNFILED_VALUE ? null : moveTarget,
                })
              }
            >
              Move
            </E3Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label>Folder</Label>
          <Select value={moveTarget} onValueChange={setMoveTarget}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNFILED_VALUE}>Unfiled</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </E3Modal>

      <E3Modal
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && removeMany.isPending) return;
          setDeleteOpen(open);
        }}
        title={bulkPlan.deletable.length > 0 ? "Delete files?" : "These files stay on the live screens"}
        description={
          bulkPlan.blocked.length > 0
            ? "Files in live playlists are never deleted silently."
            : "This cannot be undone."
        }
        footer={
          <>
            <E3Button variant="outline" disabled={removeMany.isPending} onClick={() => setDeleteOpen(false)}>
              {bulkPlan.deletable.length > 0 ? "Cancel" : "Close"}
            </E3Button>
            {bulkPlan.deletable.length > 0 ? (
              <E3Button
                variant="danger"
                loading={removeMany.isPending}
                onClick={() => removeMany.mutate(bulkPlan.deletable.map((item) => item.id))}
              >
                {bulkPlan.blocked.length > 0
                  ? `Delete ${bulkPlan.deletable.length} unused`
                  : `Delete ${bulkPlan.deletable.length}`}
              </E3Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-3">
          {bulkPlan.blocked.length > 0 ? (
            <E3Alert
              severity="critical"
              title="Used in live playlists"
              detail={inUseDeleteMessage(bulkPlan.blocked)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Delete {bulkPlan.deletable.length} file{bulkPlan.deletable.length === 1 ? "" : "s"} from the library.
            </p>
          )}
          {bulkPlan.blocked.length > 0 && bulkPlan.deletable.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {bulkPlan.deletable.length} unused file{bulkPlan.deletable.length === 1 ? "" : "s"} can still be deleted.
              In-use files stay so the live TV keeps playing.
            </p>
          ) : null}
        </div>
      </E3Modal>

      <E3Modal
        open={Boolean(selected)}
        onOpenChange={(o) => {
          if (!o && mediaBusy) return;
          if (!o) setSelected(null);
        }}
        title={selected?.filename ?? "Media"}
        description="Preview and metadata"
        className="sm:max-w-2xl"
        footer={
          <>
            <E3Button variant="outline" disabled={!selected || mediaBusy} onClick={() => selected && openMove(selected)}>
              Move to folder…
            </E3Button>
            <E3Button
              variant="outline"
              disabled={!selected || mediaBusy}
              loading={replace.isPending}
              onClick={() => replaceInputRef.current?.click()}
            >
              Replace
            </E3Button>
            <E3Button
              variant="outline"
              disabled={!selected || mediaBusy}
              loading={download.isPending}
              onClick={() => selected && download.mutate(selected.id)}
            >
              Download
            </E3Button>
            <E3Button
              variant="outline"
              disabled={!selected || mediaBusy}
              loading={archive.isPending}
              onClick={() => selected && archive.mutate(selected.id)}
            >
              Archive
            </E3Button>
            <E3Button
              variant="danger"
              disabled={!selected || mediaBusy}
              loading={remove.isPending}
              onClick={() => selected && remove.mutate(selected.id)}
            >
              Delete
            </E3Button>
          </>
        }
      >
        {selected ? (
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            <input
              ref={replaceInputRef}
              type="file"
              accept={ACCEPT_MEDIA}
              className="sr-only"
              aria-label="Replace media file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file && selected) replace.mutate({ id: selected.id, file });
              }}
            />
            <MediaThumb item={selected} className="aspect-video w-full" />

            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="rename">Filename</Label>
                <Input
                  id="rename"
                  value={renaming}
                  onChange={(e) => setRenaming(e.target.value)}
                />
              </div>
              <E3Button
                variant="secondary"
                className="self-end"
                loading={rename.isPending}
                disabled={mediaBusy}
                onClick={() => rename.mutate({ id: selected.id, filename: renaming })}
              >
                Rename
              </E3Button>
            </div>

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                ["Folder", selected.folderName ?? "Unfiled"],
                ["Type", selected.type],
                ["Dimensions", selected.dimensions],
                ["Duration", selected.durationSec ? `${selected.durationSec}s` : "—"],
                ["File size", `${selected.sizeMb.toFixed(1)} MB`],
                ["Version", selected.version],
                ["Uploaded by", selected.uploadedBy],
                ["Uploaded", selected.uploadedAt],
                ["Modified", selected.modifiedAt],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h4 className="font-display text-sm font-semibold uppercase tracking-wide">Used in</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Playlists</p>
                  <p className="mt-1">{selected.usedIn.playlists.join(", ") || "—"}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Campaigns</p>
                  <p className="mt-1">{selected.usedIn.campaigns.join(", ") || "—"}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Screens</p>
                  <p className="mt-1">{selected.usedIn.screens.join(", ") || "—"}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </E3Modal>
    </div>
  );
}

function LibraryGrid({
  folders,
  items,
  searching,
  selectedIds,
  selectionActive,
  showUnfiledHeading,
  onBackgroundClick,
  onOpenFolder,
  onOpenMedia,
  onToggle,
  onMove,
}: {
  folders: MediaFolder[];
  items: Media[];
  searching: boolean;
  selectedIds: Set<string>;
  selectionActive: boolean;
  showUnfiledHeading: boolean;
  onBackgroundClick: () => void;
  onOpenFolder: (folder: MediaFolder) => void;
  onOpenMedia: (item: Media, event?: MouseEvent<HTMLButtonElement>) => void;
  onToggle: (item: Media, event: MouseEvent<HTMLButtonElement>) => void;
  onMove: (item: Media) => void;
}) {
  function handleBackground(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-media-card], button")) return;
    onBackgroundClick();
  }

  return (
    <div className="space-y-6" onClick={handleBackground}>
      {folders.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((folder) => (
            <FolderCard key={folder.id} folder={folder} onOpen={onOpenFolder} />
          ))}
        </div>
      ) : null}
      {showUnfiledHeading ? (
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Unfiled
        </h2>
      ) : null}
      {items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((m) => (
            <E3MediaCard
              key={m.id}
              item={m}
              selectable
              checked={selectedIds.has(m.id)}
              selectionActive={selectionActive}
              folderLabel={folderCardLabel(m.folderName, searching)}
              onOpen={onOpenMedia}
              onToggle={onToggle}
              onMove={onMove}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
