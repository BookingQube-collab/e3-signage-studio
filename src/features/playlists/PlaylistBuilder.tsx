import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  E3Button,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3Modal,
  E3PageHeader,
  E3StatusBadge,
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
import { mediaService, playlistService } from "@/services";
import { isUuid } from "@/services/inventory-map";
import type { Playlist, PlaylistItem, Transition } from "@/types";
import { bindPreviewClips } from "@/lib/playlist-preview";
import { MediaPicker } from "@/features/media/MediaPicker";
import { PlaylistLoopPreview } from "./PlaylistLoopPreview";

const TRANSITIONS: Transition[] = ["Cut", "Fade", "Slide"];

export function PlaylistBuilder({
  initial,
  canManage = true,
}: {
  initial: Playlist;
  canManage?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const savedPlaylist = isUuid(initial.id);
  const [playlist, setPlaylist] = useState<Playlist>({
    ...initial,
    items: Array.isArray(initial.items) ? initial.items : [],
  });
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const mediaQuery = useQuery({ queryKey: ["media"], queryFn: mediaService.list });
  const foldersQuery = useQuery({ queryKey: ["media-folders"], queryFn: mediaService.listFolders });

  const save = useMutation({
    mutationFn: playlistService.save,
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ["playlists"] });
      void qc.invalidateQueries({ queryKey: ["playlist"] });
      void qc.invalidateQueries({ queryKey: ["screens"] });
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(
        p.usedByScreens > 0
          ? `${p.name} saved · live screens will download the updated loop`
          : `${p.name} saved`,
      );
      setPlaylist({ ...p, items: Array.isArray(p.items) ? p.items : [] });
      if (!savedPlaylist) {
        void navigate({ to: "/playlists/$id", params: { id: p.id } });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save playlist.");
    },
  });

  const remove = useMutation({
    mutationFn: () => playlistService.remove(playlist.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["playlists"] });
      void qc.invalidateQueries({ queryKey: ["playlist"] });
      void qc.invalidateQueries({ queryKey: ["screens"] });
      toast.success(`${playlist.name || "Playlist"} deleted`);
      setDeleteOpen(false);
      void navigate({ to: "/playlists" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete playlist.");
    },
  });

  const items = Array.isArray(playlist.items) ? playlist.items : [];
  const totalSec = items.reduce((sum, i) => sum + (i.durationSec || 0), 0);
  const previewClips = bindPreviewClips(
    items,
    new Map((mediaQuery.data ?? []).map((m) => [m.id, m])),
  );

  function move(from: number, to: number) {
    if (!canManage) return;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setPlaylist({ ...playlist, items: next });
  }

  function patchItem(id: string, patch: Partial<PlaylistItem>) {
    if (!canManage) return;
    setPlaylist({
      ...playlist,
      items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  }

  return (
    <div>
      <E3PageHeader
        breadcrumb={
          <Link to="/playlists" className="hover:text-foreground">
            ← All playlists
          </Link>
        }
        title={playlist.name || (savedPlaylist ? "Edit playlist" : "New playlist")}
        description={
          savedPlaylist
            ? `Edit name, items, timing and loop · ${items.length} items · ${Math.floor(totalSec / 60)}m ${totalSec % 60}s total`
            : `${items.length} items · ${Math.floor(totalSec / 60)}m ${totalSec % 60}s total`
        }
        actions={
          <>
            {canManage && savedPlaylist ? (
              <E3Button
                variant="outline"
                disabled={save.isPending || remove.isPending}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> Delete
              </E3Button>
            ) : null}
            {canManage ? (
              <E3Button
                variant="outline"
                loading={save.isPending && save.variables?.status === "Draft"}
                disabled={save.isPending}
                onClick={() => save.mutate({ ...playlist, items, status: "Draft" })}
              >
                Save Draft
              </E3Button>
            ) : null}
            <E3Button
              variant="outline"
              onClick={() =>
                document.getElementById("playlist-loop-preview")?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                })
              }
            >
              Preview
            </E3Button>
            {canManage ? (
              <E3Button
                variant="primary"
                onClick={() => save.mutate({ ...playlist, items, status: "Active" })}
                loading={save.isPending && save.variables?.status === "Active"}
                disabled={save.isPending || items.length === 0}
              >
                Publish
              </E3Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <E3Card>
            <E3CardHeader title="Playlist details" />
            <E3CardBody className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pl-name">Playlist name</Label>
                <Input
                  id="pl-name"
                  value={playlist.name}
                  onChange={(e) => setPlaylist({ ...playlist, name: e.target.value })}
                  placeholder="e.g. KDS Main Playlist"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex h-10 items-center">
                  <E3StatusBadge status={playlist.status || "Draft"} />
                </div>
              </div>
            </E3CardBody>
          </E3Card>

          <E3Card>
            <E3CardHeader
              title="Items"
              description="Drag to reorder"
              action={
                canManage ? (
                  <E3Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                    <Plus /> Add media
                  </E3Button>
                ) : undefined
              }
            />
            <E3CardBody className="space-y-3">
              {items.length === 0 ? (
                <E3EmptyState
                  title="Playlist is empty"
                  description="Add media from the library to build the loop."
                  action={
                    canManage ? (
                      <E3Button variant="primary" onClick={() => setAddOpen(true)}>
                        <Plus /> Add media
                      </E3Button>
                    ) : undefined
                  }
                />
              ) : (
                items.map((item, index) => (
                  <div
                    key={item.id}
                    draggable={canManage}
                    onDragStart={() => {
                      if (canManage) setDragIndex(index);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) move(dragIndex, index);
                      setDragIndex(null);
                    }}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border bg-background/40 p-3 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      <GripVertical className="size-4 text-muted-foreground" aria-hidden />
                      <span className="font-display w-5 text-sm tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.filename}</p>
                      <p className="text-xs text-muted-foreground">{item.type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`dur-${item.id}`} className="sr-only">
                        Duration seconds
                      </Label>
                      <Input
                        id={`dur-${item.id}`}
                        type="number"
                        min={1}
                        value={item.durationSec}
                        onChange={(e) =>
                          patchItem(item.id, { durationSec: Number(e.target.value) || 1 })
                        }
                        className="h-9 w-20"
                        disabled={!canManage}
                      />
                      <span className="text-xs text-muted-foreground">sec</span>
                    </div>
                    <Select
                      value={item.transition}
                      onValueChange={(v) => patchItem(item.id, { transition: v as Transition })}
                      disabled={!canManage}
                    >
                      <SelectTrigger className="h-9 w-28" aria-label="Transition">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSITIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {canManage ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${item.filename} up`}
                          onClick={() => move(index, index - 1)}
                          className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${item.filename} down`}
                          onClick={() => move(index, index + 1)}
                          className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          aria-label={`Duplicate ${item.filename}`}
                          onClick={() =>
                            setPlaylist({
                              ...playlist,
                              items: [
                                ...items.slice(0, index + 1),
                                { ...item, id: `${item.id}-copy-${Date.now()}` },
                                ...items.slice(index + 1),
                              ],
                            })
                          }
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
                        >
                          <Copy className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${item.filename}`}
                          onClick={() =>
                            setPlaylist({
                              ...playlist,
                              items: items.filter((i) => i.id !== item.id),
                            })
                          }
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </E3CardBody>
          </E3Card>
        </div>

        <E3Card className="h-fit" id="playlist-loop-preview">
          <E3CardHeader
            title="Preview"
            description={
              playlist.usedByScreens > 0
                ? "How this loop plays on paired TVs. Saving updates live campaigns automatically."
                : "Loop order, timing, and transitions"
            }
          />
          <E3CardBody className="space-y-4">
            <PlaylistLoopPreview clips={previewClips} />
            <ol className="space-y-2 text-sm">
              {items.map((i, idx) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {idx + 1}. {i.filename}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {i.durationSec} sec
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex justify-between border-t border-border pt-3 text-sm font-medium">
              <span>Total</span>
              <span className="tabular-nums">
                {Math.floor(totalSec / 60)}m {totalSec % 60}s
              </span>
            </div>
          </E3CardBody>
        </E3Card>
      </div>

      <E3Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add media"
        description="Open a folder or pick a thumbnail. Search looks across every folder."
        className="sm:max-w-3xl"
        footer={
          <E3Button variant="outline" onClick={() => setAddOpen(false)}>
            Done
          </E3Button>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <MediaPicker
            media={mediaQuery.data ?? []}
            folders={foldersQuery.data ?? []}
            selectedIds={new Set(items.map((item) => item.mediaId))}
            onPick={(m) =>
              setPlaylist((p) => ({
                ...p,
                items: [
                  ...(Array.isArray(p.items) ? p.items : []),
                  {
                    id: `pli-${m.id}-${Date.now()}`,
                    mediaId: m.id,
                    filename: m.filename,
                    type: m.type,
                    durationSec: m.durationSec ?? 10,
                    transition: "Fade",
                  },
                ],
              }))
            }
          />
        </div>
      </E3Modal>

      <E3Modal
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && remove.isPending) return;
          setDeleteOpen(open);
        }}
        title={`Delete ${playlist.name || "this playlist"}?`}
        description={
          playlist.usedByScreens > 0
            ? `This playlist is assigned to ${playlist.usedByScreens} screen${playlist.usedByScreens === 1 ? "" : "s"}. Those screens will be unassigned.`
            : "This removes the playlist from the CMS."
        }
        footer={
          <>
            <E3Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </E3Button>
            <E3Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete playlist
            </E3Button>
          </>
        }
      />
    </div>
  );
}
