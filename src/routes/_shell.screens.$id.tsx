import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { MonitorPlay, PowerOff, RefreshCw, ScrollText, Unlink } from "lucide-react";
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [logsOpen, setLogsOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [unpairOpen, setUnpairOpen] = useState(false);
  const [nextPlaylist, setNextPlaylist] = useState("");

  const screenQuery = useQuery({ queryKey: ["screen", id], queryFn: () => screenService.get(id) });
  const playlists = useQuery({ queryKey: ["playlists"], queryFn: playlistService.list });

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
  });

  const unpair = useMutation({
    mutationFn: () => screenService.unpair(id),
    onSuccess: () => {
      invalidate();
      toast.success("Screen unpaired");
      void navigate({ to: "/screens" });
    },
  });

  const screen = screenQuery.data;

  return (
    <div>
      <E3QueryBoundary
        isLoading={screenQuery.isLoading}
        isError={screenQuery.isError}
        refetch={() => void screenQuery.refetch()}
      >
        {!screen ? (
          <E3EmptyState
            title="Screen not found"
            description="This screen may have been unpaired."
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
                  <E3Button
                    variant="primary"
                    onClick={() => sync.mutate()}
                    disabled={sync.isPending}
                  >
                    <RefreshCw /> {sync.isPending ? "Syncing…" : "Sync Now"}
                  </E3Button>
                </>
              }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <E3Card>
                  <E3CardHeader
                    title="Current content"
                    description={screen.nowPlaying ?? "Nothing playing"}
                  />
                  <E3CardBody>
                    <div
                      className="grid aspect-video w-full place-items-center rounded-xl border border-border"
                      style={{
                        background:
                          "radial-gradient(ellipse at 30% 20%, rgba(233,90,157,.18), transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(91,162,237,.18), transparent 60%), #0f0d11",
                      }}
                    >
                      <div className="text-center">
                        <MonitorPlay className="mx-auto size-8 text-muted-foreground" aria-hidden />
                        <p className="font-display mt-3 text-lg font-semibold">
                          {screen.nowPlaying ?? "No playback"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {screen.resolution} · {screen.orientation}
                        </p>
                      </div>
                    </div>

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
                          `${screen.storageUsedGb.toFixed(1)} GB of ${screen.storageTotalGb} GB`,
                        ],
                        ["Last sync", screen.lastSync],
                        ["Last heartbeat", screen.lastSeen],
                        ["App version", screen.appVersion],
                        ["Sync state", screen.syncState],
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
                      value={(screen.storageUsedGb / screen.storageTotalGb) * 100}
                      label="Local storage"
                      tone={
                        screen.storageUsedGb / screen.storageTotalGb > 0.85 ? "warning" : "gradient"
                      }
                    />
                  </E3CardBody>
                </E3Card>
              </div>

              <div className="space-y-6">
                <E3Card>
                  <E3CardHeader title="Actions" />
                  <E3CardBody className="space-y-2">
                    <E3Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => sync.mutate()}
                    >
                      <RefreshCw /> Sync Now
                    </E3Button>
                    <E3Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setPlaylistOpen(true)}
                    >
                      <MonitorPlay /> Change Playlist
                    </E3Button>
                    <E3Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setLogsOpen(true)}
                    >
                      <ScrollText /> View Logs
                    </E3Button>
                    <E3Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => disable.mutate()}
                    >
                      <PowerOff /> {screen.status === "disabled" ? "Enable Screen" : "Disable Screen"}
                    </E3Button>
                    <E3Button
                      variant="danger"
                      className="w-full justify-start"
                      onClick={() => setUnpairOpen(true)}
                    >
                      <Unlink /> Unpair
                    </E3Button>
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
              onOpenChange={setPlaylistOpen}
              title="Change playlist"
              description="The screen will download the new content on the next sync."
              footer={
                <>
                  <E3Button variant="outline" onClick={() => setPlaylistOpen(false)}>
                    Cancel
                  </E3Button>
                  <E3Button
                    variant="primary"
                    disabled={!nextPlaylist || changePlaylist.isPending}
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
              description="Last 20 player events (mocked)."
              footer={
                <E3Button variant="outline" onClick={() => setLogsOpen(false)}>
                  Close
                </E3Button>
              }
            >
              <pre className="max-h-72 overflow-auto rounded-xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">
                {[
                  "10:32:11  heartbeat ok",
                  "10:31:52  playback started Birthday Package.mp4",
                  "10:31:50  playlist loaded (4 items)",
                  "10:30:12  sync complete v43",
                  "10:29:40  downloading manifest v43",
                  "10:15:03  heartbeat ok",
                  "09:58:22  playback loop restarted",
                ].join("\n")}
              </pre>
            </E3Modal>

            <E3Modal
              open={unpairOpen}
              onOpenChange={setUnpairOpen}
              title="Unpair this screen?"
              description="The device will stop receiving content until it is paired again."
              footer={
                <>
                  <E3Button variant="outline" onClick={() => setUnpairOpen(false)}>
                    Cancel
                  </E3Button>
                  <E3Button variant="danger" onClick={() => unpair.mutate()}>
                    Unpair screen
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
