import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Cloud, FolderPlus, Image as ImageIcon, LayoutGrid, List, Search } from "lucide-react";
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
  applyBulkDelete,
  applySelectionClick,
  inUseDeleteMessage,
  mediaStorageDeleteCopy,
  partitionBulkDelete,
  releaseHiddenIfGone,
  selectAllActionLabel,
  toggleSelectAll,
  unionIds,
  withoutIds,
  type MediaStorageBackend,
} from "@/lib/media-bulk";
import { ACCEPT_MEDIA } from "@/lib/media-file";
import {
  applyFolderCascadeDelete,
  applyMovedMediaBulk,
  applyRenamedMedia,
  applyUploadedMedia,
  countFilesInFolder,
  findFolderByName,
  folderCardLabel,
  folderDeleteCopy,
  foldersInLibraryView,
  libraryViewFor,
  mediaInLibraryView,
  mediaLibraryPaintState,
  mergeLibraryMedia,
  resolveUploadFolderId,
  uniqueFoldersByName,
  upsertFolder,
} from "@/lib/media-folders";
import { describeCanceledStatement, describeResyncError } from "@/lib/media-upload-error";
import { describeResyncToast, describeUploadBatchToast } from "@/lib/media-upload-lifecycle";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { invalidateKeysInBackground } from "@/lib/query-cache";
import { hasQueryClientContext } from "@/lib/router-preload";
import { useIsClient } from "@/lib/use-is-client";
import { useViewPreference } from "@/lib/view-preference";
import { cn } from "@/lib/utils";
import { mediaService } from "@/services";
import type { Media, MediaFolder } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";

const MEDIA_VIEWS = ["grid", "list"] as const;

export const Route = createFileRoute("/_shell/media")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/media");
  },
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
  const isClient = useIsClient();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewPreference("media", MEDIA_VIEWS, "grid");
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
  const [deleteFile, setDeleteFile] = useState<Media | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<MediaFolder | null>(null);
  const [deleteFromStorage, setDeleteFromStorage] = useState(false);
  const [hiddenMediaIds, setHiddenMediaIds] = useState<Set<string>>(new Set());
  const [hiddenFolderIds, setHiddenFolderIds] = useState<Set<string>>(new Set());

  const mediaQuery = useQuery({
    queryKey: ["media"],
    queryFn: mediaService.list,
    enabled: isClient,
    throwOnError: false,
  });
  const foldersQuery = useQuery({
    queryKey: ["media-folders"],
    queryFn: mediaService.listFolders,
    enabled: isClient,
    throwOnError: false,
  });
  const storageBackendQuery = useQuery({
    queryKey: ["media-storage-backend"],
    queryFn: mediaService.storageBackend,
    enabled: isClient,
    staleTime: 60 * 60 * 1000,
    throwOnError: false,
  });
  const storageBackend: MediaStorageBackend =
    storageBackendQuery.data === "supabase" ? "supabase" : "r2";
  const storageDeleteCopy = mediaStorageDeleteCopy(storageBackend);

  const folders = useMemo(
    () =>
      uniqueFoldersByName(
        (Array.isArray(foldersQuery.data) ? foldersQuery.data : []).filter(
          (folder) => !hiddenFolderIds.has(folder.id),
        ),
      ),
    [foldersQuery.data, hiddenFolderIds],
  );
  const libraryMedia = useMemo(
    () => (Array.isArray(mediaQuery.data) ? mediaQuery.data : []).filter((item) => !hiddenMediaIds.has(item.id)),
    [mediaQuery.data, hiddenMediaIds],
  );
  const currentFolder = folders.find((folder) => folder.id === folderId) ?? null;
  const libraryView = libraryViewFor(search, folderId);
  const searching = libraryView.mode === "search";

  function mergeIntoLibrary(added: Media[]) {
    if (added.length === 0) return;
    const named = added.map((item) => ({
      ...item,
      folderName:
        item.folderName ??
        folders.find((folder) => folder.id === item.folderId)?.name ??
        (item.folderId === folderId ? (currentFolder?.name ?? null) : null),
    }));
    const currentMedia = qc.getQueryData<Media[]>(["media"]) ?? [];
    const currentFolders = qc.getQueryData<MediaFolder[]>(["media-folders"]) ?? [];
    const next = applyUploadedMedia(currentMedia, currentFolders, named);
    qc.setQueryData(["media"], next.media);
    qc.setQueryData(["media-folders"], next.folders);
  }

  const upload = useMutation({
    mutationFn: ({
      files,
      onProgress,
      targetFolderId,
    }: {
      files: File[];
      onProgress: (fileName: string, percent: number, ready?: Media) => void;
      targetFolderId: string | null;
    }) => mediaService.upload(files, onProgress, resolveUploadFolderId(targetFolderId)),
    retry: 0,
    onSuccess: (result) => {
      const added = result.uploaded;
      const ids = added.map((item) => item.id);
      setHiddenMediaIds((prev) => withoutIds(prev, ids));
      mergeIntoLibrary(added);
      const notice = describeUploadBatchToast(added.length, result.failed);
      if (notice.tone === "success") toast.success(notice.title);
      else if (notice.tone === "warning") toast.warning(notice.title);
      else toast.error(notice.title);
      for (const detail of notice.details) toast.error(detail);
    },
    onSettled: (result) => {
      const added = result?.uploaded ?? [];
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["media"] }),
        qc.invalidateQueries({ queryKey: ["media-folders"] }),
      ]).then(() => {
        if (added.length > 0) mergeIntoLibrary(added);
      });
    },
  });

  const resync = useMutation({
    mutationFn: (targetFolderId: string | null) => mediaService.resyncFromStorage(targetFolderId),
    onSuccess: (added) => {
      mergeIntoLibrary(added);
      toast.success(describeResyncToast(added.length).title);
    },
    onError: (error) => {
      toast.error(describeResyncError(error instanceof Error ? error.message : ""));
    },
    onSettled: (added) => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["media"] }),
        qc.invalidateQueries({ queryKey: ["media-folders"] }),
      ]).then(() => {
        if (added && added.length > 0) mergeIntoLibrary(added);
      });
    },
  });

  const createFolder = useMutation({
    mutationFn: mediaService.createFolder,
    onSuccess: (folder) => {
      setHiddenFolderIds((prev) => withoutIds(prev, [folder.id]));
      qc.setQueryData(["media-folders"], (prev: MediaFolder[] | undefined) =>
        upsertFolder(prev ?? [], folder),
      );
      setCreateOpen(false);
      setNewFolderName("");
      setFolderId(folder.id);
      toast.success(`${folder.name} created`);
      invalidateKeysInBackground(qc, [["media-folders"]]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not create folder.");
    },
  });

  const deleteFolder = useMutation({
    mutationFn: ({ id, deleteFromStorage: purgeStorage }: { id: string; deleteFromStorage: boolean }) =>
      mediaService.deleteFolder(id, { deleteFromStorage: purgeStorage }),
    throwOnError: false,
    onMutate: async ({ id }) => {
      const previousMedia = qc.getQueryData<Media[]>(["media"]) ?? [];
      const mediaIds = previousMedia.filter((item) => item.folderId === id).map((item) => item.id);
      return { mediaIds, folderId: id };
    },
    onSuccess: (_ok, { id }, ctx) => {
      try {
        const previousMedia = qc.getQueryData<Media[]>(["media"]) ?? [];
        const previousFolders = qc.getQueryData<MediaFolder[]>(["media-folders"]) ?? [];
        const mediaIds = ctx?.mediaIds ?? previousMedia.filter((item) => item.folderId === id).map((item) => item.id);
        setHiddenFolderIds((prev) => unionIds(prev, [id]));
        setHiddenMediaIds((prev) => unionIds(prev, mediaIds));
        const cascaded = applyFolderCascadeDelete(
          Array.isArray(previousMedia) ? previousMedia : [],
          Array.isArray(previousFolders) ? previousFolders : [],
          id,
        );
        qc.setQueryData(["media"], cascaded.media);
        qc.setQueryData(["media-folders"], cascaded.folders);
        setFolderId((prev) => (prev === id ? null : prev));
        setSelected((prev) => (prev?.folderId === id ? null : prev));
        setSelectedIds((prev) => withoutIds(prev, mediaIds));
      } catch {
        setFolderId((prev) => (prev === id ? null : prev));
      }
      setDeleteFolderTarget(null);
      setDeleteFromStorage(false);
      toast.success("Folder deleted");
    },
    onError: (error) => {
      toast.error(
        describeCanceledStatement(
          error instanceof Error ? error.message : "",
          "Could not finish deleting this folder. It is still in the library. Try again, or remove files from live playlists first.",
        ),
      );
    },
    onSettled: (_data, error, vars, ctx) => {
      const id = vars.id;
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["media"] }),
        qc.invalidateQueries({ queryKey: ["media-folders"] }),
      ])
        .catch(() => {
          // Stay on /media; the toast already explained a failed delete.
        })
        .then(() => {
          if (error || !ctx) return;
          setHiddenMediaIds((prev) =>
            releaseHiddenIfGone(prev, qc.getQueryData<Media[]>(["media"]) ?? [], ctx.mediaIds),
          );
          setHiddenFolderIds((prev) =>
            releaseHiddenIfGone(prev, qc.getQueryData<MediaFolder[]>(["media-folders"]) ?? [], [id]),
          );
        });
    },
  });

  const moveToFolder = useMutation({
    mutationFn: ({ ids, nextFolderId }: { ids: string[]; nextFolderId: string | null }) =>
      mediaService.moveManyToFolder(ids, nextFolderId),
    onMutate: async ({ ids, nextFolderId }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ["media"] }),
        qc.cancelQueries({ queryKey: ["media-folders"] }),
      ]);
      const previousMedia = qc.getQueryData<Media[]>(["media"]);
      const previousFolders = qc.getQueryData<MediaFolder[]>(["media-folders"]);
      const destName =
        nextFolderId == null
          ? null
          : ((previousFolders ?? []).find((folder) => folder.id === nextFolderId)?.name ?? null);
      const patched = applyMovedMediaBulk(
        previousMedia ?? [],
        previousFolders ?? [],
        ids,
        nextFolderId,
        destName,
      );
      qc.setQueryData(["media"], patched.media);
      qc.setQueryData(["media-folders"], patched.folders);
      setSelected((prev) =>
        prev && ids.includes(prev.id)
          ? { ...prev, folderId: nextFolderId, folderName: destName }
          : prev,
      );
      setMoveIds([]);
      clearSelection();
      return { previousMedia, previousFolders, destName };
    },
    onSuccess: (moved, _vars, ctx) => {
      mergeIntoLibrary(moved);
      const dest = moved[0]?.folderName ?? ctx?.destName;
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
    onError: (error, _vars, ctx) => {
      if (ctx?.previousMedia) qc.setQueryData(["media"], ctx.previousMedia);
      if (ctx?.previousFolders) qc.setQueryData(["media-folders"], ctx.previousFolders);
      toast.error(error instanceof Error ? error.message : "Could not move media.");
    },
    onSettled: () => {
      invalidateKeysInBackground(qc, [["media"], ["media-folders"]]);
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      mediaService.rename(id, filename),
    onMutate: async ({ id, filename }) => {
      await qc.cancelQueries({ queryKey: ["media"] });
      const previous = qc.getQueryData<Media[]>(["media"]);
      setHiddenMediaIds((prev) => withoutIds(prev, [id]));
      const current = previous?.find((item) => item.id === id);
      if (current) {
        qc.setQueryData(["media"], applyRenamedMedia(previous ?? [], { ...current, filename }));
        setSelected((prev) => (prev?.id === id ? { ...prev, filename } : prev));
      }
      return { previous };
    },
    onSuccess: (m) => {
      setHiddenMediaIds((prev) => withoutIds(prev, [m.id]));
      qc.setQueryData(["media"], (prev: Media[] | undefined) => applyRenamedMedia(prev ?? [], m));
      setSelected(m);
      setRenaming(m.filename);
      toast.success("Renamed");
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["media"], ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not rename.");
    },
    onSettled: (m) => {
      void qc.invalidateQueries({ queryKey: ["media"] }).then(() => {
        if (!m) return;
        setHiddenMediaIds((prev) => withoutIds(prev, [m.id]));
        qc.setQueryData(["media"], (prev: Media[] | undefined) =>
          applyRenamedMedia(mergeLibraryMedia(prev ?? [], [m]), m),
        );
      });
    },
  });

  const replace = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => mediaService.replace(id, file),
    retry: 0,
    onSuccess: (m) => {
      qc.setQueryData(["media"], (prev: Media[] | undefined) =>
        applyRenamedMedia(mergeLibraryMedia(prev ?? [], [m]), m),
      );
      setSelected(m);
      toast.success("New version uploaded");
      invalidateKeysInBackground(qc, [["media"]]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Replace failed.");
    },
  });

  const archive = useMutation({
    mutationFn: mediaService.archive,
    onSuccess: () => {
      setSelected(null);
      toast.success("Archived");
      invalidateKeysInBackground(qc, [["media"], ["media-folders"]]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not archive.");
    },
  });

  const remove = useMutation({
    mutationFn: ({ id, deleteFromStorage: purgeStorage }: { id: string; deleteFromStorage: boolean }) =>
      mediaService.remove(id, { deleteFromStorage: purgeStorage }),
    onMutate: async ({ id }) => {
      const previousMedia = qc.getQueryData<Media[]>(["media"]);
      setHiddenMediaIds((prev) => unionIds(prev, [id]));
      await qc.cancelQueries({ queryKey: ["media"] });
      qc.setQueryData(["media"], applyBulkDelete(previousMedia ?? [], [id]));
      setSelected((prev) => (prev?.id === id ? null : prev));
      setDeleteFile(null);
      setDeleteFromStorage(false);
      setSelectedIds((prev) => withoutIds(prev, [id]));
      return { previousMedia };
    },
    onSuccess: () => {
      toast.success("Media deleted");
    },
    onError: (error, { id }, ctx) => {
      setHiddenMediaIds((prev) => withoutIds(prev, [id]));
      if (ctx?.previousMedia) qc.setQueryData(["media"], ctx.previousMedia);
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    },
    onSettled: (_data, _error, { id }) => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["media"] }),
        qc.invalidateQueries({ queryKey: ["media-folders"] }),
      ]).then(() => {
        setHiddenMediaIds((prev) =>
          releaseHiddenIfGone(prev, qc.getQueryData<Media[]>(["media"]) ?? [], [id]),
        );
      });
    },
  });

  const removeMany = useMutation({
    mutationFn: ({
      ids,
      deleteFromStorage: purgeStorage,
    }: {
      ids: string[];
      deleteFromStorage: boolean;
    }) => mediaService.removeMany(ids, { deleteFromStorage: purgeStorage }),
    onMutate: async ({ ids }) => {
      const previousMedia = qc.getQueryData<Media[]>(["media"]);
      setHiddenMediaIds((prev) => unionIds(prev, ids));
      await qc.cancelQueries({ queryKey: ["media"] });
      qc.setQueryData(["media"], applyBulkDelete(previousMedia ?? [], ids));
      setDeleteOpen(false);
      setDeleteFromStorage(false);
      setSelected((prev) => (prev && ids.includes(prev.id) ? null : prev));
      setSelectedIds((prev) => withoutIds(prev, ids));
      return { previousMedia, ids };
    },
    onSuccess: () => {
      toast.success("Media deleted");
    },
    onError: (error, { ids }, ctx) => {
      setHiddenMediaIds((prev) => withoutIds(prev, ids));
      if (ctx?.previousMedia) qc.setQueryData(["media"], ctx.previousMedia);
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    },
    onSettled: (_data, _error, { ids }) => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["media"] }),
        qc.invalidateQueries({ queryKey: ["media-folders"] }),
      ]).then(() => {
        setHiddenMediaIds((prev) =>
          releaseHiddenIfGone(prev, qc.getQueryData<Media[]>(["media"]) ?? [], ids),
        );
      });
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
    const scoped = mediaInLibraryView(libraryMedia, libraryView);
    return scoped
      .filter((m) => {
        if (filter === "All" || filter === "Recently Added") return true;
        if (filter === "Videos") return m.type === "Video";
        if (filter === "Images") return m.type === "Image" || m.type === "Logo";
        return m.type === "QR";
      })
      .slice(0, filter === "Recently Added" ? 8 : undefined);
  }, [libraryMedia, libraryView, filter]);

  const visibleIds = useMemo(() => items.map((item) => item.id), [items]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const overlayOpen =
    createOpen ||
    moveIds.length > 0 ||
    Boolean(selected) ||
    deleteOpen ||
    Boolean(deleteFile) ||
    Boolean(deleteFolderTarget);
  const deletingFolderId = deleteFolder.isPending ? (deleteFolder.variables?.id ?? null) : null;
  const uploadBlockedInThisFolder = Boolean(deletingFolderId && folderId === deletingFolderId);
  const bulkPlan = partitionBulkDelete(libraryMedia, selectedIds);
  const folderFiles = deleteFolderTarget
    ? libraryMedia.filter((item) => item.folderId === deleteFolderTarget.id)
    : [];
  const folderPlan = partitionBulkDelete(
    folderFiles,
    folderFiles.map((item) => item.id),
  );
  const folderFileCount = deleteFolderTarget
    ? Math.max(deleteFolderTarget.fileCount, countFilesInFolder(libraryMedia, deleteFolderTarget.id))
    : 0;
  const folderCopy = folderDeleteCopy(deleteFolderTarget?.name ?? "folder", folderFileCount);

  function submitNewFolder() {
    const existing = findFolderByName(folders, newFolderName);
    if (existing) {
      setCreateOpen(false);
      setNewFolderName("");
      setFolderId(existing.id);
      return;
    }
    createFolder.mutate(newFolderName);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setAnchorId(null);
  }

  function applySelectAllToggle() {
    const next = toggleSelectAll(allSelected, visibleIds);
    setSelectedIds(next);
    setAnchorId(next.size > 0 ? (visibleIds[0] ?? null) : null);
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
    // List skips video signing; hydrate preview URL when the detail modal opens.
    if (item.type === "Video") {
      const hasPlayable =
        typeof item.previewUrl === "string" && /^https?:\/\//i.test(item.previewUrl.trim());
      if (!hasPlayable) {
        void mediaService.get(item.id).then((full) => {
          if (!full) return;
          setSelected((prev) => (prev?.id === full.id ? full : prev));
          qc.setQueryData<Media[]>(["media"], (prev) =>
            Array.isArray(prev) ? prev.map((row) => (row.id === full.id ? full : row)) : prev,
          );
        });
      }
    }
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

  // Root is folder cards. Do not block them on the media list (c58c4fd regression), and do not
  // call the library empty until both queries have settled (4bab9c7).
  const { loading, empty, errored } = mediaLibraryPaintState({
    isClient,
    folders: {
      isPending: foldersQuery.isPending,
      isError: foldersQuery.isError,
      hasSettled: foldersQuery.isSuccess || foldersQuery.isError,
    },
    media: {
      isPending: mediaQuery.isPending,
      isError: mediaQuery.isError,
      hasSettled: mediaQuery.isSuccess || mediaQuery.isError,
    },
    viewMode: libraryView.mode,
    visibleFolderCount: visibleFolders.length,
    itemCount: items.length,
  });
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
                onClick={() => {
                  const target = currentFolder;
                  void (async () => {
                    try {
                      // Refresh usedIn before the delete plan so playlist edits are not stale.
                      await mediaQuery.refetch();
                    } catch {
                      // Still open the dialog; server re-checks on confirm.
                    }
                    setDeleteFromStorage(false);
                    setDeleteFolderTarget(target);
                  })();
                }}
              >
                Delete folder
              </E3Button>
            ) : null}
            <E3Button
              variant="outline"
              loading={resync.isPending}
              disabled={resync.isPending}
              onClick={() => resync.mutate(folderId)}
            >
              <Cloud /> Sync from Cloudflare
            </E3Button>
            <E3Button variant="primary" onClick={() => setCreateOpen(true)}>
              <FolderPlus /> Create folder
            </E3Button>
          </>
        }
      />

      <div className="mb-6">
        <UploadDropzone
          disabled={uploadBlockedInThisFolder}
          hint={
            uploadBlockedInThisFolder
              ? "Wait until this folder is removed before uploading"
              : folderId && !searching
                ? `Uploads go into ${currentFolder?.name ?? "this folder"}`
                : "Uploads stay in Unfiled until you move them"
          }
          onUpload={async (files, onProgress) => {
            await upload.mutateAsync({
              files,
              onProgress: (fileName, percent, ready) => {
                onProgress(fileName, percent);
                if (ready) mergeIntoLibrary([ready]);
              },
              targetFolderId: folderId,
            });
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
                onClick={applySelectAllToggle}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {selectAllActionLabel(allSelected)}
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
        onSelectAll={applySelectAllToggle}
        onClear={clearSelection}
        onMove={() => {
          setMoveIds([...selectedIds]);
          setMoveTarget(UNFILED_VALUE);
        }}
        onDelete={() => {
          setDeleteFromStorage(false);
          setDeleteOpen(true);
        }}
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
            title={searching ? "No matching media" : libraryView.mode === "folder" ? "This folder is empty" : "No media uploaded"}
            description={
              searching
                ? "Search looks across every folder."
                : libraryView.mode === "folder"
                  ? "Drop a video or image above to add it here."
                  : "Create a folder for a venue or campaign, or drop files into Unfiled."
            }
            action={
              libraryView.mode === "folder" ? undefined : (
                <E3Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <FolderPlus /> Create folder
                </E3Button>
              )
            }
          />
        ) : (
          <LibraryGrid
            view={view}
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
            onEdit={(item) => {
              setSelected(item);
              setRenaming(item.filename);
            }}
            onDelete={(item) => {
              setDeleteFromStorage(false);
              setDeleteFile(item);
            }}
            onDeleteFolder={(folder) => {
              setDeleteFromStorage(false);
              setDeleteFolderTarget(folder);
            }}
          />
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
              onClick={submitNewFolder}
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
                submitNewFolder();
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
          if (!open) setDeleteFromStorage(false);
        }}
        title={bulkPlan.deletable.length > 0 ? "Delete files?" : "These files stay on the live screens"}
        description={
          bulkPlan.blocked.length > 0
            ? "Files in live playlists are never deleted silently."
            : "This removes files from the library. Files used in live playlists cannot be deleted."
        }
        footer={
          <>
            <E3Button
              variant="outline"
              disabled={removeMany.isPending}
              onClick={() => {
                setDeleteOpen(false);
                setDeleteFromStorage(false);
              }}
            >
              {bulkPlan.deletable.length > 0 ? "Cancel" : "Close"}
            </E3Button>
            {bulkPlan.deletable.length > 0 ? (
              <E3Button
                variant="danger"
                loading={removeMany.isPending}
                onClick={() =>
                  removeMany.mutate({
                    ids: bulkPlan.deletable.map((item) => item.id),
                    deleteFromStorage,
                  })
                }
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
          {bulkPlan.deletable.length > 0 ? (
            <StorageDeleteOption
              id="bulk-delete-from-storage"
              copy={storageDeleteCopy}
              checked={deleteFromStorage}
              disabled={removeMany.isPending}
              onCheckedChange={setDeleteFromStorage}
            />
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
              onClick={() => {
                if (!selected) return;
                setDeleteFromStorage(false);
                setDeleteFile(selected);
              }}
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
            <MediaThumb item={selected} playback className="aspect-video w-full" />

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
                ["File size", `${Number.isFinite(selected.sizeMb) ? selected.sizeMb.toFixed(1) : "0.0"} MB`],
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

      <E3Modal
        open={Boolean(deleteFile)}
        onOpenChange={(open) => {
          if (!open && remove.isPending) return;
          if (!open) {
            setDeleteFile(null);
            setDeleteFromStorage(false);
          }
        }}
        title={deleteFile ? `Delete ${deleteFile.filename}?` : "Delete file?"}
        description="This removes the file from the library. Files used in live playlists cannot be deleted."
        footer={
          <>
            <E3Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => {
                setDeleteFile(null);
                setDeleteFromStorage(false);
              }}
            >
              Cancel
            </E3Button>
            <E3Button
              variant="danger"
              loading={remove.isPending}
              disabled={!deleteFile}
              onClick={() =>
                deleteFile &&
                remove.mutate({ id: deleteFile.id, deleteFromStorage })
              }
            >
              Delete file
            </E3Button>
          </>
        }
      >
        <StorageDeleteOption
          id="file-delete-from-storage"
          copy={storageDeleteCopy}
          checked={deleteFromStorage}
          disabled={remove.isPending}
          onCheckedChange={setDeleteFromStorage}
        />
      </E3Modal>

      <E3Modal
        open={Boolean(deleteFolderTarget)}
        onOpenChange={(open) => {
          if (!open && deleteFolder.isPending) return;
          if (!open) {
            setDeleteFolderTarget(null);
            setDeleteFromStorage(false);
          }
        }}
        title={deleteFolderTarget ? folderCopy.title : "Delete folder?"}
        description={
          folderPlan.blocked.length > 0
            ? "Files in live playlists are never deleted silently."
            : folderCopy.description
        }
        footer={
          <>
            <E3Button
              variant="outline"
              disabled={deleteFolder.isPending}
              onClick={() => {
                setDeleteFolderTarget(null);
                setDeleteFromStorage(false);
              }}
            >
              {folderPlan.blocked.length > 0 && folderPlan.deletable.length === 0 ? "Close" : "Cancel"}
            </E3Button>
            {folderPlan.blocked.length === 0 ? (
              <E3Button
                variant="danger"
                loading={deleteFolder.isPending}
                disabled={!deleteFolderTarget}
                onClick={() =>
                  deleteFolderTarget &&
                  deleteFolder.mutate({
                    id: deleteFolderTarget.id,
                    deleteFromStorage,
                  })
                }
              >
                {folderCopy.confirmLabel}
              </E3Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-3">
          {folderPlan.blocked.length > 0 ? (
            <E3Alert
              severity="critical"
              title="Used in live playlists"
              detail={inUseDeleteMessage(folderPlan.blocked)}
            />
          ) : folderCopy.detail ? (
            <E3Alert severity="warning" title="Folder is not empty" detail={folderCopy.detail} />
          ) : (
            <p className="text-sm text-muted-foreground">Remove this empty folder from the library.</p>
          )}
          {folderPlan.blocked.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Remove {folderPlan.blocked.length === 1 ? "that file" : "those files"} from live playlists
              first, then delete the folder. The folder and its other files stay so the live TV keeps playing.
            </p>
          ) : null}
          {folderPlan.blocked.length === 0 ? (
            <StorageDeleteOption
              id="folder-delete-from-storage"
              copy={storageDeleteCopy}
              checked={deleteFromStorage}
              disabled={deleteFolder.isPending}
              onCheckedChange={setDeleteFromStorage}
            />
          ) : null}
        </div>
      </E3Modal>
    </div>
  );
}

function LibraryGrid({
  view = "grid",
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
  onEdit,
  onDelete,
  onDeleteFolder,
}: {
  view?: "grid" | "list";
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
  onEdit: (item: Media) => void;
  onDelete: (item: Media) => void;
  onDeleteFolder: (folder: MediaFolder) => void;
}) {
  function handleBackground(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-media-card], button")) return;
    onBackgroundClick();
  }

  const folderLayout =
    view === "list"
      ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  const mediaLayout =
    view === "list" ? "space-y-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="space-y-6" onClick={handleBackground}>
      {folders.length > 0 ? (
        <div className={folderLayout}>
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onOpen={onOpenFolder}
              onDelete={onDeleteFolder}
            />
          ))}
        </div>
      ) : null}
      {showUnfiledHeading ? (
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Unfiled
        </h2>
      ) : null}
      {items.length > 0 ? (
        <div className={mediaLayout}>
          {items.map((m) => (
            <E3MediaCard
              key={m.id}
              item={m}
              view={view}
              selectable
              checked={selectedIds.has(m.id)}
              selectionActive={selectionActive}
              folderLabel={folderCardLabel(m.folderName, searching || (view === "list" && Boolean(m.folderName)))}
              onOpen={onOpenMedia}
              onToggle={onToggle}
              onMove={onMove}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StorageDeleteOption({
  id,
  copy,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  copy: ReturnType<typeof mediaStorageDeleteCopy>;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-describedby={hintId}
        />
        <div className="min-w-0 space-y-1">
          <label htmlFor={id} className="text-sm font-medium leading-none">
            {copy.checkboxLabel}
          </label>
          <p id={hintId} className="text-xs text-muted-foreground">
            {checked ? copy.checkedHint : copy.uncheckedHint}
          </p>
        </div>
      </div>
    </div>
  );
}
