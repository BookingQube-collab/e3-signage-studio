import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { MonitorPlay, Pencil, PowerOff, RefreshCw, ScrollText, Trash2, Unlink, Wrench } from "lucide-react";
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
  E3Progress,
  E3QueryBoundary,
  E3StatusBadge,
} from "@/components/e3";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { playlistService, screenService } from "@/services";
import { NO_LOCATION_ACCESS_MESSAGE } from "@/lib/location-scope";
import { adminMonitoringRefetchInterval } from "@/lib/monitoring";
import { bindPreviewClips } from "@/lib/playlist-preview";
import { useLiveMonitoring } from "@/lib/use-live-monitoring";
import { PlaylistLoopPreview } from "@/features/playlists/PlaylistLoopPreview";
import { EditScreenDialog } from "@/features/screens/EditScreenDialog";
import { RepairScreenDialog } from "@/features/screens/RepairScreenDialog";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_shell/screens/$id")({
  head: () => ({
    meta: [
      { title: "Screen detail — E3 Digital Signage" },
      {
        name: "description",
        content: "Live playback, device information and sync controls for a single screen.",
      },
      { property: "og:title", content: "Screen detail — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Live playback, device information and sync controls for a single screen.",
      },
    ],
  }),
  component: ScreenDetailPage,
});

function ScreenDetailPage() {
  const { id } = Route.useParams();
  const { auth } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canManageScreens = Boolean(auth?.ok && hasPermission(auth.profile.role, "screens.manage"));
  const [logsOpen, setLogsOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [unpairOpen, setUnpairOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [nextPlaylist, setNextPlaylist] = useState("");

  const screenQuery = useQuery({
    queryKey: ["screen", id],
    queryFn: () => screenService.get(id),
    refetchInterval: adminMonitoringRefetchInterval,
  });
  const playlists = useQuery({ queryKey: ["playlists"], queryFn: playlistService.list });
  const assignedPlaylist = useQuery({
    queryKey: ["playlist", screenQuery.data?.playlistId],
    queryFn: () => playlistService.get(screenQuery.data!.playlistId!),
    enabled: Boolean(screenQuery.data?.playlistId),
  });
  const logsQuery = useQuery({
    queryKey: ["screen-logs", id],
    queryFn: () => screenService.logs(id),
    enabled: logsOpen,
  });
  useLiveMonitoring([["screen", id], ["screens"], ["screen-logs", id]]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["screen", id] });
    void qc.invalidateQueries({ queryKey: ["screens"] });
  };

  const sync = useMutation({
    mutationFn: () => screenService.syncNow(id),
    onSuccess: () => {
      invalidate();
      toast.success("Sync requested");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not request sync");
    },
  });

  const changePlaylist = useMutation({
    mutationFn: (playlistId: string) => {
      const pl = (playlists.data ?? []).find((p) => p.id === playlistId);
      return screenService.update(id, {
        playlistId,
        playlistName: pl?.name ?? null,
        syncState: "Waiting",
        syncProgress: 0,
      });
    },
    onSuccess: () => {
      invalidate();
      setPlaylistOpen(false);
      toast.success("Playlist changed");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not change playlist");
    },
  });

  const disable = useMutation({
    mutationFn: () =>
      screenService.update(id, {
        status: screenQuery.data?.status === "disabled" ? "online" : "disabled",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Screen updated");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update screen");
    },
  });

  const unpair = useMutation({
    mutationFn: () => screenService.unpair(id),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Screen unpaired");
      void navigate({ to: "/screens" });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not unpair screen");
    },
  });

  const screen = screenQuery.data;
  // Playlist.get already signs item preview URLs — no full media library fetch.
  const previewClips = bindPreviewClips(assignedPlaylist.data?.items ?? [], new Map());

  return (
    <div>
      <E3QueryBoundary
        isLoading={screenQuery.isLoading}
        isError={screenQuery.isError}
        refetch={() => void screenQuery.refetch()}
      >
        {!screen ? (
          <E3EmptyState
            title={NO_LOCATION_ACCESS_MESSAGE}
            description="This screen is not at one of your assigned locations, or it may have been unpaired."
            action={
              <E3Button variant="outline" asChild>
                <Link to="/screens">Back to screens</Link>
              </E3Button>
            }
          />
        ) : (
          <>
            <E3PageHeader
              breadcrumb={
                <Link to="/screens" className="hover:text-foreground">
                  ← All screens
                </Link>
              }
              title={screen.name}
              description={`${screen.locationName} · ${screen.screenType}`}
              actions={
                <>
                  <E3StatusBadge status={screen.status} className="self-center" />
                  {canManageScreens ? (
                    <>
                      <E3Button variant="outline" onClick={() => setEditOpen(true)}>
                        <Pencil /> Edit
                      </E3Button>
                      <E3Button variant="danger" onClick={() => setUnpairOpen(true)}>
                        <Trash2 /> Delete
                      </E3Button>
                      <E3Button
                        variant="primary"
                        onClick={() => sync.mutate()}
                        loading={sync.isPending}
                      >
                        <RefreshCw /> Sync Now
                      </E3Button>
                    </>
                  ) : null}
                </>
              }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <E3Card>
                  <E3CardHeader
                    title="Current content"
                    description={
                      previewClips.length > 1
                        ? `${screen.nowPlaying ?? "Assigned playlist"} · ${previewClips.length} items looping`
                        : (screen.nowPlaying ?? "Nothing playing")
                    }
                  />
                  <E3CardBody>
                    <PlaylistLoopPreview
                      clips={previewClips}
                      startMediaId={screen.nowPlayingMediaId}
                      emptyLabel={
                        screen.nowPlaying
                          ? `${screen.nowPlaying} · ${screen.resolution} · ${screen.orientation}`
                          : "No playback"
                      }
                    />

                    {screen.syncState === "Downloading" ? (
                      <E3Progress
                        className="mt-4"
                        value={screen.syncProgress}
                        label="Downloading content"
                      />
                    ) : null}
                  </E3CardBody>
                </E3Card>

                <E3Card>
                  <E3CardHeader title="Device information" />
                  <E3CardBody>
                    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                      {[
                        ["Current playlist", screen.playlistName ?? "—"],
                        ["Local version", screen.localVersion],
                        ["Cloud version", screen.cloudVersion],
                        ["Resolution", screen.resolution],
                        ["Orientation", screen.orientation],
                        [
                          "Storage used",
                          screen.storageTotalGb > 0
                            ? `${screen.storageUsedGb.toFixed(1)} GB of ${screen.storageTotalGb.toFixed(1)} GB`
                            : "Unknown until the player reports storage",
                        ],
                        ["Last sync", screen.lastSync],
                        ["Last heartbeat", screen.lastSeen],
                        ["App version", screen.appVersion],
                        ["Sync state", screen.syncState],
                        ["Last error", screen.lastError ?? "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <E3Progress
                      className="mt-6"
                      value={
                        screen.storageTotalGb > 0
                          ? (screen.storageUsedGb / screen.storageTotalGb) * 100
                          : 0
                      }
                      label="Local storage"
                      tone={
                        screen.storageTotalGb > 0 &&
                        screen.storageUsedGb / screen.storageTotalGb > 0.85
                          ? "warning"
                          : "gradient"
                      }
                    />
                  </E3CardBody>
                </E3Card>
              </div>

              <div className="space-y-6">
                <E3Card>
                  <E3CardHeader title="Actions" />
                  <E3CardBody className="space-y-2">
                    {canManageScreens ? (
                      <E3Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setEditOpen(true)}
                      >
                        <Pencil /> Edit
                      </E3Button>
                    ) : null}
                    {canManageScreens ? (
                      <E3Button
                        variant="outline"
                        className="w-full justify-start"
                        loading={sync.isPending}
                        onClick={() => sync.mutate()}
                      >
                        <RefreshCw /> Sync Now
                      </E3Button>
                    ) : null}
                    {canManageScreens ? (
                      <E3Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setPlaylistOpen(true)}
                      >
                        <MonitorPlay /> Change Playlist
                      </E3Button>
                    ) : null}
                    <E3Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setLogsOpen(true)}
                    >
                      <ScrollText /> View Logs
                    </E3Button>
                    {canManageScreens ? (
                      <>
                        <E3Button
                          variant="outline"
                          className="w-full justify-start"
                          loading={disable.isPending}
                          onClick={() => disable.mutate()}
                        >
                          <PowerOff />{" "}
                          {screen.status === "disabled" ? "Enable Screen" : "Disable Screen"}
                        </E3Button>
                        <E3Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => setRepairOpen(true)}
                        >
                          <Wrench /> Repair
                        </E3Button>
                        <E3Button
                          variant="danger"
                          className="w-full justify-start"
                          onClick={() => setUnpairOpen(true)}
                        >
                          <Unlink /> Unpair
                        </E3Button>
                      </>
                    ) : null}
                  </E3CardBody>
                </E3Card>

                <E3Card>
                  <E3CardHeader title="Health" />
                  <E3CardBody className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Version match</span>
                      <span
                        className={
                          screen.localVersion === screen.cloudVersion
                            ? "text-success"
                            : "text-warning"
                        }
                      >
                        {screen.localVersion === screen.cloudVersion ? "In sync" : "Behind cloud"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Heartbeat</span>
                      <span>{screen.lastSeen}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Groups</span>
                      <span>{screen.groupIds.length}</span>
                    </div>
                  </E3CardBody>
                </E3Card>
              </div>
            </div>

            <E3Modal
              open={playlistOpen}
              onOpenChange={(open) => {
                if (!open && changePlaylist.isPending) return;
                setPlaylistOpen(open);
              }}
              title="Change playlist"
              description="The screen will download the new content on the next sync."
              footer={
                <>
                  <E3Button variant="outline" disabled={changePlaylist.isPending} onClick={() => setPlaylistOpen(false)}>
                    Cancel
                  </E3Button>
                  <E3Button
                    variant="primary"
                    loading={changePlaylist.isPending}
                    disabled={!nextPlaylist}
                    onClick={() => changePlaylist.mutate(nextPlaylist)}
                  >
                    Apply
                  </E3Button>
                </>
              }
            >
              <Select value={nextPlaylist} onValueChange={setNextPlaylist}>
                <SelectTrigger aria-label="Playlist">
                  <SelectValue placeholder="Select a playlist" />
                </SelectTrigger>
                <SelectContent>
                  {(playlists.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </E3Modal>

            <E3Modal
              open={logsOpen}
              onOpenChange={setLogsOpen}
              title="Device logs"
              description="Heartbeats, sync acks, playback, and player errors from this screen."
              footer={
                <E3Button variant="outline" onClick={() => setLogsOpen(false)}>
                  Close
                </E3Button>
              }
            >
              {logsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading device logs…</p>
              ) : logsQuery.isError ? (
                <p className="text-sm text-destructive">Could not load device logs.</p>
              ) : (logsQuery.data ?? []).length === 0 ? (
                <pre className="max-h-72 overflow-auto rounded-xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">
                  No device logs yet. Heartbeats and playback logs appear after the player is online.
                </pre>
              ) : (
                <ol className="max-h-72 space-y-3 overflow-auto rounded-xl bg-background p-4 text-xs leading-relaxed">
                  {(logsQuery.data ?? []).map((line) => (
                    <li key={line.id} className="min-w-0">
                      <p className="font-medium text-foreground">
                        <span className="uppercase tracking-wide text-muted-foreground">{line.source}</span>
                        {" · "}
                        {line.at}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">{line.message}</p>
                    </li>
                  ))}
                </ol>
              )}
            </E3Modal>

            <EditScreenDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              screen={screen}
            />

            <RepairScreenDialog
              open={repairOpen}
              onOpenChange={setRepairOpen}
              screenId={screen.id}
              screenName={screen.name}
            />

            <E3Modal
              open={unpairOpen}
              onOpenChange={(open) => {
                if (!open && unpair.isPending) return;
                setUnpairOpen(open);
              }}
              title="Delete this screen?"
              description="This unpairs the device. It will stop receiving content until it is paired again."
              footer={
                <>
                  <E3Button variant="outline" disabled={unpair.isPending} onClick={() => setUnpairOpen(false)}>
                    Cancel
                  </E3Button>
                  <E3Button variant="danger" loading={unpair.isPending} onClick={() => unpair.mutate()}>
                    Delete screen
                  </E3Button>
                </>
              }
            />
          </>
        )}
      </E3QueryBoundary>
    </div>
  );
}
