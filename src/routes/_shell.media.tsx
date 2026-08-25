import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Image as ImageIcon, LayoutGrid, List, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
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
import { UploadDropzone } from "@/features/media/UploadDropzone";
import { cn } from "@/lib/utils";
import { mediaService } from "@/services";
import type { Media } from "@/types";

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

function MediaPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Media | null>(null);
  const [renaming, setRenaming] = useState("");

  const mediaQuery = useQuery({ queryKey: ["media"], queryFn: mediaService.list });

  const upload = useMutation({
    mutationFn: mediaService.upload,
    onSuccess: (added) => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      toast.success(`${added.length} file${added.length > 1 ? "s" : ""} uploaded`);
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

  const remove = useMutation({
    mutationFn: mediaService.remove,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["media"] });
      setSelected(null);
      toast.success("Media deleted");
    },
  });

  const items = useMemo(() => {
    const all = mediaQuery.data ?? [];
    return all
      .filter((m) => (search ? m.filename.toLowerCase().includes(search.toLowerCase()) : true))
      .filter((m) => {
        if (filter === "All" || filter === "Recently Added") return true;
        if (filter === "Videos") return m.type === "Video";
        if (filter === "Images") return m.type === "Image" || m.type === "Logo";
        return m.type === "QR";
      })
      .slice(0, filter === "Recently Added" ? 8 : undefined);
  }, [mediaQuery.data, filter, search]);

  return (
    <div>
      <E3PageHeader
        title="Media Library"
        description="Everything available to playlists, layouts and campaigns."
      />

      <div className="mb-6">
        <UploadDropzone onComplete={(files) => upload.mutate(files)} />
      </div>

      <E3Card className="mb-6">
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

      <E3QueryBoundary
        isLoading={mediaQuery.isLoading}
        isError={mediaQuery.isError}
        refetch={() => void mediaQuery.refetch()}
      >
        {items.length === 0 ? (
          <E3EmptyState
            icon={ImageIcon}
            title="No media uploaded"
            description="Drop a video or image above to build your first playlist."
          />
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((m) => (
              <E3MediaCard
                key={m.id}
                item={m}
                onOpen={(x) => {
                  setSelected(x);
                  setRenaming(x.filename);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((m) => (
              <E3MediaCard
                key={m.id}
                item={m}
                view="list"
                onOpen={(x) => {
                  setSelected(x);
                  setRenaming(x.filename);
                }}
              />
            ))}
          </div>
        )}
      </E3QueryBoundary>

      <E3Modal
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected?.filename ?? "Media"}
        description="Preview and metadata"
        className="sm:max-w-2xl"
        footer={
          <>
            <E3Button variant="outline" onClick={() => toast.info("Replace flow is UI-only")}>
              Replace
            </E3Button>
            <E3Button variant="outline" onClick={() => toast.info("Download queued")}>
              Download
            </E3Button>
            <E3Button variant="outline" onClick={() => toast.info("Archived")}>
              Archive
            </E3Button>
            <E3Button
              variant="danger"
              onClick={() => selected && remove.mutate(selected.id)}
            >
              Delete
            </E3Button>
          </>
        }
      >
        {selected ? (
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
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
                onClick={() => rename.mutate({ id: selected.id, filename: renaming })}
              >
                Rename
              </E3Button>
            </div>

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
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
