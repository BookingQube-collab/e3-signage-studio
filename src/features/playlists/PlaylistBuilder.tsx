import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
import type { Playlist, PlaylistItem, Transition } from "@/types";

const TRANSITIONS: Transition[] = ["Cut", "Fade", "Slide"];

export function PlaylistBuilder({ initial }: { initial: Playlist }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist>(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const mediaQuery = useQuery({ queryKey: ["media"], queryFn: mediaService.list });

  const save = useMutation({
    mutationFn: playlistService.save,
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ["playlists"] });
      void qc.invalidateQueries({ queryKey: ["playlist"] });
      toast.success(`${p.name} saved`);
      void navigate({ to: "/playlists" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save playlist.");
    },
  });

  const totalSec = playlist.items.reduce((sum, i) => sum + i.durationSec, 0);

  function move(from: number, to: number) {
    if (to < 0 || to >= playlist.items.length) return;
    const items = [...playlist.items];
    const [moved] = items.splice(from, 1);
    if (!moved) return;
    items.splice(to, 0, moved);
    setPlaylist({ ...playlist, items });
  }

  function patchItem(id: string, patch: Partial<PlaylistItem>) {
    setPlaylist({
      ...playlist,
      items: playlist.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  }

  return (
    <div>
      <E3PageHeader
        title={playlist.name || "New playlist"}
        description={`${playlist.items.length} items · ${Math.floor(totalSec / 60)}m ${totalSec % 60}s total`}
        actions={
          <>
            <E3Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({ ...playlist, status: "Draft" })}
            >
              Save Draft
            </E3Button>
            <E3Button variant="outline" onClick={() => toast.info("Preview is UI-only")}>
              Preview
            </E3Button>
            <E3Button
              variant="primary"
              onClick={() => save.mutate({ ...playlist, status: "Active" })}
              disabled={save.isPending || playlist.items.length === 0}
            >
              Publish
            </E3Button>
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
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex h-10 items-center">
                  <E3StatusBadge status={playlist.status} />
                </div>
              </div>
            </E3CardBody>
          </E3Card>

          <E3Card>
            <E3CardHeader
              title="Items"
              description="Drag to reorder"
              action={
                <E3Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus /> Add media
                </E3Button>
              }
            />
            <E3CardBody className="space-y-3">
              {playlist.items.length === 0 ? (
                <E3EmptyState
                  title="Playlist is empty"
                  description="Add media from the library to build the loop."
                  action={
                    <E3Button variant="primary" onClick={() => setAddOpen(true)}>
                      <Plus /> Add media
                    </E3Button>
                  }
                />
              ) : (
                playlist.items.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDragIndex(index)}
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
                      />
                      <span className="text-xs text-muted-foreground">sec</span>
                    </div>
                    <Select
                      value={item.transition}
                      onValueChange={(v) => patchItem(item.id, { transition: v as Transition })}
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
                              ...playlist.items.slice(0, index + 1),
                              { ...item, id: `${item.id}-copy-${Date.now()}` },
                              ...playlist.items.slice(index + 1),
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
                            items: playlist.items.filter((i) => i.id !== item.id),
                          })
                        }
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </E3CardBody>
          </E3Card>
        </div>

        <E3Card className="h-fit">
          <E3CardHeader title="Preview" description="Loop order and timing" />
          <E3CardBody className="space-y-4">
            <div
              className="grid aspect-video place-items-center rounded-xl border border-border text-center"
              style={{
                background:
                  "radial-gradient(ellipse at 20% 10%, rgba(141,92,221,.22), transparent 60%), #0f0d11",
              }}
            >
              <div>
                <p className="font-display text-base font-semibold">
                  {playlist.items[0]?.filename ?? "No content"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {playlist.items[0] ? `${playlist.items[0].durationSec}s` : "Add media to preview"}
                </p>
              </div>
            </div>
            <ol className="space-y-2 text-sm">
              {playlist.items.map((i, idx) => (
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
        description="Select items from the library."
        className="sm:max-w-xl"
        footer={
          <E3Button variant="outline" onClick={() => setAddOpen(false)}>
            Done
          </E3Button>
        }
      >
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {(mediaQuery.data ?? []).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                setPlaylist((p) => ({
                  ...p,
                  items: [
                    ...p.items,
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
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent/50"
            >
              <span className="min-w-0 truncate text-sm">{m.filename}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{m.type}</span>
            </button>
          ))}
        </div>
      </E3Modal>
    </div>
  );
}
