import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, getRouteApi } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  E3Button,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3Modal,
  E3PageHeader,
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
import { firstHttpUrl } from "@/lib/playlist-preview";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac";
import { isUuid } from "@/services/inventory-map";
import { layoutService, mediaService } from "@/services";
import { MediaPicker } from "@/features/media/MediaPicker";
import type {
  FitMode,
  Layout,
  LayoutPreset,
  LayoutZone,
  Media,
  Orientation,
  ZoneContentType,
} from "@/types";

const PRESETS: LayoutPreset[] = [
  "Full Screen",
  "50/50",
  "70/30",
  "30/70",
  "Video + Side Banner",
  "Video + Bottom Banner",
  "3 Zones",
  "4 Zones",
  "Portrait",
  "Custom",
];

const ZONE_TYPES: ZoneContentType[] = [
  "Video",
  "Image",
  "Slideshow",
  "Text",
  "QR",
  "Logo",
  "Date",
  "Time",
];

const FIT_MODES: FitMode[] = ["Fill", "Cover", "Contain", "Stretch"];

function zone(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  contentType: ZoneContentType = "Image",
): LayoutZone {
  return {
    id,
    name,
    x,
    y,
    width,
    height,
    contentType,
    contentRef: null,
    fit: "Cover",
    background: "#252229",
    durationSec: 15,
  };
}

export function presetZones(preset: LayoutPreset): LayoutZone[] {
  switch (preset) {
    case "Full Screen":
      return [zone("z1", "Full", 0, 0, 100, 100, "Video")];
    case "50/50":
      return [zone("z1", "Left", 0, 0, 50, 100, "Video"), zone("z2", "Right", 50, 0, 50, 100)];
    case "70/30":
      return [zone("z1", "Main", 0, 0, 70, 100, "Video"), zone("z2", "Side", 70, 0, 30, 100)];
    case "30/70":
      return [zone("z1", "Side", 0, 0, 30, 100), zone("z2", "Main", 30, 0, 70, 100, "Video")];
    case "Video + Side Banner":
      return [
        zone("z1", "Video", 0, 0, 70, 100, "Video"),
        zone("z2", "Promotion", 70, 0, 30, 60),
        zone("z3", "QR Code", 70, 60, 30, 40, "QR"),
      ];
    case "Video + Bottom Banner":
      return [zone("z1", "Video", 0, 0, 100, 80, "Video"), zone("z2", "Banner", 0, 80, 100, 20)];
    case "3 Zones":
      return [
        zone("z1", "Video", 0, 0, 70, 100, "Video"),
        zone("z2", "Top right", 70, 0, 30, 50),
        zone("z3", "Bottom right", 70, 50, 30, 50, "QR"),
      ];
    case "4 Zones":
      return [
        zone("z1", "Top left", 0, 0, 50, 50, "Video"),
        zone("z2", "Top right", 50, 0, 50, 50),
        zone("z3", "Bottom left", 0, 50, 50, 50, "Slideshow"),
        zone("z4", "Bottom right", 50, 50, 50, 50, "QR"),
      ];
    case "Portrait":
      return [
        zone("z1", "Video", 0, 0, 100, 65, "Video"),
        zone("z2", "Content", 0, 65, 100, 25, "Slideshow"),
        zone("z3", "Time", 0, 90, 100, 10, "Time"),
      ];
    default:
      return [zone("z1", "Zone 1", 0, 0, 60, 60, "Video")];
  }
}

function selectValue<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function fitObjectClass(fit: FitMode | null | undefined): string {
  switch (fit) {
    case "Contain":
      return "object-contain";
    case "Fill":
    case "Stretch":
      return "object-fill";
    case "Cover":
    default:
      return "object-cover";
  }
}

function contentTypeForMedia(media: Media): ZoneContentType {
  switch (media.type) {
    case "Video":
      return "Video";
    case "QR":
      return "QR";
    case "Logo":
      return "Logo";
    default:
      return "Image";
  }
}

function mediaForRef(library: Media[], contentRef: string | null | undefined): Media | null {
  if (!contentRef) return null;
  return library.find((item) => item.filename === contentRef || item.id === contentRef) ?? null;
}

function ZoneMediaFill({
  media,
  fit,
  playback,
}: {
  media: Media;
  fit: FitMode;
  playback?: boolean;
}) {
  const poster = firstHttpUrl(media.thumbnailUrl);
  const videoSrc = media.type === "Video" ? firstHttpUrl(media.previewUrl, media.thumbnailUrl) : null;
  const imageSrc =
    media.type === "Video" ? poster : firstHttpUrl(media.thumbnailUrl, media.previewUrl);
  const objectClass = fitObjectClass(fit);

  if (videoSrc) {
    return (
      <video
        src={videoSrc}
        poster={poster && poster !== videoSrc ? poster : undefined}
        className={cn("absolute inset-0 size-full", objectClass)}
        muted
        playsInline
        autoPlay={playback}
        loop={playback}
        preload={playback ? "auto" : "metadata"}
        referrerPolicy="no-referrer"
      />
    );
  }

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        className={cn("absolute inset-0 size-full", objectClass)}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  }

  return null;
}

function LayoutCanvas({
  layout,
  zones,
  mediaLibrary,
  selectedId,
  interactive,
  onSelect,
  onAssign,
}: {
  layout: Layout;
  zones: LayoutZone[];
  mediaLibrary: Media[];
  selectedId?: string | null;
  interactive?: boolean;
  onSelect?: (id: string) => void;
  onAssign?: (zoneId: string, media: Media) => void;
}) {
  const portrait = layout.orientation === "Portrait";

  return (
    <div
      className={cn(
        "relative mx-auto w-full overflow-hidden rounded-xl border border-border",
        portrait ? "max-w-sm" : "",
      )}
      style={{
        aspectRatio: portrait ? "9 / 16" : "16 / 9",
        background: layout.background,
      }}
    >
      {zones.map((z) => {
        const media = mediaForRef(mediaLibrary, z.contentRef);
        const selected = interactive && selectedId === z.id;
        const sharedClassName = cn(
          "absolute overflow-hidden border text-left transition-colors",
          interactive ? "cursor-pointer" : "",
          selected ? "border-transparent ring-2 ring-e3-pink ring-inset" : "border-white/10",
          interactive && !selected ? "hover:border-white/25" : "",
        );
        const sharedStyle = {
          left: `${z.x}%`,
          top: `${z.y}%`,
          width: `${z.width}%`,
          height: `${z.height}%`,
          background: z.background,
        } as const;
        const body = (
          <>
            {media ? (
              <ZoneMediaFill media={media} fit={z.fit} playback={!interactive || selected} />
            ) : null}
            <span
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2 pb-2 pt-6",
                media
                  ? ""
                  : "inset-0 grid place-items-center bg-none from-transparent via-transparent to-transparent px-2 py-2",
              )}
            >
              <span className={cn("min-w-0", media ? "block" : "text-center")}>
                <span className="font-display block truncate text-[10px] font-semibold uppercase tracking-widest text-white/90 sm:text-xs">
                  {z.name}
                </span>
                <span className="block truncate text-[10px] text-white/70 sm:text-[11px]">
                  {z.contentRef ?? z.contentType}
                </span>
              </span>
            </span>
          </>
        );

        if (interactive) {
          return (
            <button
              key={z.id}
              type="button"
              onClick={onSelect ? () => onSelect(z.id) : undefined}
              onDragOver={(e) => e.preventDefault()}
              onDrop={
                onAssign
                  ? (e) => {
                      e.preventDefault();
                      const filename = e.dataTransfer.getData("text/plain");
                      const mediaId = e.dataTransfer.getData("application/x-e3-media-id");
                      const dropped =
                        (mediaId
                          ? mediaLibrary.find((item) => item.id === mediaId)
                          : undefined) ??
                        mediaLibrary.find((item) => item.filename === filename);
                      if (dropped) onAssign(z.id, dropped);
                    }
                  : undefined
              }
              className={sharedClassName}
              style={sharedStyle}
            >
              {body}
            </button>
          );
        }

        return (
          <div key={z.id} className={sharedClassName} style={sharedStyle}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

const shellRoute = getRouteApi("/_shell");

export function LayoutBuilder({ initial }: { initial: Layout }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { auth } = shellRoute.useRouteContext();
  const canManage = Boolean(auth?.ok && hasPermission(auth.profile.role, "layouts.manage"));
  const [layout, setLayout] = useState<Layout>({
    ...initial,
    zones: Array.isArray(initial.zones) ? initial.zones : [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    Array.isArray(initial.zones) ? (initial.zones[0]?.id ?? null) : null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const savedLayout = isUuid(initial.id);

  const mediaQuery = useQuery({ queryKey: ["media"], queryFn: mediaService.list });
  const foldersQuery = useQuery({ queryKey: ["media-folders"], queryFn: mediaService.listFolders });
  const mediaLibrary = mediaQuery.data ?? [];

  const save = useMutation({
    mutationFn: layoutService.save,
    onSuccess: (l) => {
      void qc.invalidateQueries({ queryKey: ["layouts"] });
      void qc.invalidateQueries({ queryKey: ["layout"] });
      toast.success(`${l.name || "Layout"} saved`);
      void navigate({ to: "/layouts" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save layout.");
    },
  });

  const remove = useMutation({
    mutationFn: () => layoutService.remove(layout.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["layouts"] });
      void qc.invalidateQueries({ queryKey: ["layout"] });
      toast.success(`${layout.name || "Layout"} deleted`);
      setDeleteOpen(false);
      void navigate({ to: "/layouts" });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not delete layout.");
    },
  });

  const zones = Array.isArray(layout.zones) ? layout.zones : [];
  const selected = zones.find((z) => z.id === selectedId) ?? null;

  function patchZone(id: string, patch: Partial<LayoutZone>) {
    setLayout({ ...layout, zones: zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) });
  }

  function assignMediaToZone(zoneId: string, media: Media) {
    patchZone(zoneId, {
      contentRef: media.filename,
      contentType: contentTypeForMedia(media),
    });
  }

  return (
    <div>
      <E3PageHeader
        title={layout.name || "New layout"}
        description={`${layout.preset} · ${layout.orientation} · ${layout.resolution}`}
        actions={
          <>
            {savedLayout && canManage ? (
              <E3Button variant="outline" disabled={save.isPending || remove.isPending} onClick={() => setDeleteOpen(true)}>
                <Trash2 /> Delete
              </E3Button>
            ) : null}
            <E3Button variant="outline" onClick={() => setPreviewOpen(true)}>
              Preview
            </E3Button>
            <E3Button
              variant="primary"
              onClick={() => save.mutate(layout)}
              loading={save.isPending}
              disabled={!layout.name}
            >
              Save Template
            </E3Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <E3Card>
            <E3CardHeader title="Preset" description="Start from a standard zone arrangement" />
            <E3CardBody className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={layout.preset === p}
                  onClick={() => {
                    const zones = presetZones(p);
                    setLayout({
                      ...layout,
                      preset: p,
                      zones,
                      orientation: p === "Portrait" ? "Portrait" : layout.orientation,
                      resolution: p === "Portrait" ? "1080 × 1920" : layout.resolution,
                    });
                    setSelectedId(zones[0]?.id ?? null);
                  }}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    layout.preset === p
                      ? "e3-gradient border-transparent text-white"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </E3CardBody>
          </E3Card>

          <E3Card>
            <E3CardHeader
              title="Canvas"
              description="Click a zone to configure it. Drop media onto a zone to assign content."
              action={
                <E3Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const z = zone(`z${Date.now()}`, `Zone ${zones.length + 1}`, 10, 10, 40, 30);
                    setLayout({ ...layout, preset: "Custom", zones: [...zones, z] });
                    setSelectedId(z.id);
                  }}
                >
                  <Plus /> Add zone
                </E3Button>
              }
            />
            <E3CardBody>
              <LayoutCanvas
                layout={layout}
                zones={zones}
                mediaLibrary={mediaLibrary}
                selectedId={selectedId}
                interactive
                onSelect={setSelectedId}
                onAssign={assignMediaToZone}
              />

              <div className="mt-5">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Drag media into a zone
                </p>
                <div className="max-h-80 overflow-y-auto pr-1">
                  <MediaPicker
                    media={mediaLibrary}
                    folders={foldersQuery.data ?? []}
                    draggable
                    onPick={(m) => {
                      if (selectedId) assignMediaToZone(selectedId, m);
                    }}
                  />
                </div>
              </div>
            </E3CardBody>
          </E3Card>
        </div>

        <div className="space-y-6">
          <E3Card>
            <E3CardHeader title="Screen properties" />
            <E3CardBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lay-name">Layout name</Label>
                <Input
                  id="lay-name"
                  value={layout.name}
                  onChange={(e) => setLayout({ ...layout, name: e.target.value })}
                  placeholder="e.g. Reception Split"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lay-orient">Orientation</Label>
                <Select
                  value={layout.orientation}
                  onValueChange={(v) =>
                    setLayout({
                      ...layout,
                      orientation: v as Orientation,
                      resolution: v === "Portrait" ? "1080 × 1920" : "1920 × 1080",
                    })
                  }
                >
                  <SelectTrigger id="lay-orient">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Landscape">Landscape</SelectItem>
                    <SelectItem value="Portrait">Portrait</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lay-res">Resolution</Label>
                <Select
                  value={layout.resolution}
                  onValueChange={(v) => setLayout({ ...layout, resolution: v })}
                >
                  <SelectTrigger id="lay-res">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1920 × 1080">1920 × 1080</SelectItem>
                    <SelectItem value="3840 × 2160">3840 × 2160</SelectItem>
                    <SelectItem value="1080 × 1920">1080 × 1920</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lay-bg">Background colour</Label>
                <Input
                  id="lay-bg"
                  type="color"
                  value={layout.background}
                  onChange={(e) => setLayout({ ...layout, background: e.target.value })}
                  className="h-10 w-full p-1"
                />
              </div>
            </E3CardBody>
          </E3Card>

          <E3Card>
            <E3CardHeader
              title="Zone"
              description={selected ? selected.name : "Select a zone on the canvas"}
            />
            <E3CardBody className="space-y-4">
              {!selected ? (
                <p className="text-sm text-muted-foreground">No zone selected.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="z-name">Name</Label>
                    <Input
                      id="z-name"
                      value={selected.name}
                      onChange={(e) => patchZone(selected.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(["x", "y", "width", "height"] as const).map((k) => (
                      <div key={k} className="space-y-2">
                        <Label htmlFor={`z-${k}`} className="capitalize">
                          {k} (%)
                        </Label>
                        <Input
                          id={`z-${k}`}
                          type="number"
                          min={0}
                          max={100}
                          value={selected[k]}
                          onChange={(e) =>
                            patchZone(selected.id, { [k]: Number(e.target.value) || 0 })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="z-type">Content type</Label>
                    <Select
                      value={selectValue(selected.contentType, ZONE_TYPES, "Image")}
                      onValueChange={(v) =>
                        patchZone(selected.id, { contentType: v as ZoneContentType })
                      }
                    >
                      <SelectTrigger id="z-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ZONE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="z-content">Content</Label>
                    <Select
                      value={selected.contentRef && selected.contentRef.length > 0 ? selected.contentRef : "none"}
                      onValueChange={(v) => {
                        if (v === "none") {
                          patchZone(selected.id, { contentRef: null });
                          return;
                        }
                        const media = mediaForRef(mediaLibrary, v);
                        if (media) assignMediaToZone(selected.id, media);
                        else patchZone(selected.id, { contentRef: v });
                      }}
                    >
                      <SelectTrigger id="z-content">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No content</SelectItem>
                        {(mediaQuery.data ?? [])
                          .filter((m) => Boolean(m.filename))
                          .map((m) => (
                          <SelectItem key={m.id} value={m.filename}>
                            {m.folderName ? `${m.folderName} / ${m.filename}` : m.filename}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="z-fit">Fit mode</Label>
                      <Select
                        value={selectValue(selected.fit, FIT_MODES, "Contain")}
                        onValueChange={(v) => patchZone(selected.id, { fit: v as FitMode })}
                      >
                        <SelectTrigger id="z-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIT_MODES.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="z-dur">Duration (s)</Label>
                      <Input
                        id="z-dur"
                        type="number"
                        min={0}
                        value={selected.durationSec}
                        onChange={(e) =>
                          patchZone(selected.id, { durationSec: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="z-bg">Background</Label>
                    <Input
                      id="z-bg"
                      type="color"
                      value={selected.background}
                      onChange={(e) => patchZone(selected.id, { background: e.target.value })}
                      className="h-10 w-full p-1"
                    />
                  </div>
                  <E3Button
                    variant="danger"
                    className="w-full"
                    onClick={() => {
                      setLayout({
                        ...layout,
                        preset: "Custom",
                        zones: zones.filter((z) => z.id !== selected.id),
                      });
                      setSelectedId(null);
                    }}
                  >
                    <Trash2 /> Remove zone
                  </E3Button>
                </>
              )}
            </E3CardBody>
          </E3Card>
        </div>
      </div>

      <E3Modal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={layout.name || "Layout preview"}
        description={`${layout.preset} · ${layout.orientation} · ${layout.resolution}`}
        className="max-w-5xl"
        footer={
          <E3Button variant="outline" onClick={() => setPreviewOpen(false)}>
            Close
          </E3Button>
        }
      >
        <LayoutCanvas layout={layout} zones={zones} mediaLibrary={mediaLibrary} />
      </E3Modal>

      <E3Modal
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && remove.isPending) return;
          setDeleteOpen(open);
        }}
        title={`Delete ${layout.name || "this layout"}?`}
        description="Remove this layout from campaigns and playlists first. This cannot be undone."
        footer={
          <>
            <E3Button variant="outline" disabled={remove.isPending} onClick={() => setDeleteOpen(false)}>
              Cancel
            </E3Button>
            <E3Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete layout
            </E3Button>
          </>
        }
      />
    </div>
  );
}
