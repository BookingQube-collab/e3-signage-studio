import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ImageIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PermissionDenied } from "@/components/auth/PermissionDenied";
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
import { Switch } from "@/components/ui/switch";
import { MediaPicker } from "@/features/media/MediaPicker";
import {
  DEFAULT_CMS_SETTINGS,
  DEFAULT_PUBLIC_CMS_URL,
  loadCmsSettings,
  saveCmsSettings,
} from "@/lib/cms-settings";
import { hasPermission } from "@/lib/rbac";
import {
  getOrganizationSettingsFn,
  updateWaitingScreenSettingsFn,
} from "@/lib/settings-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { mediaService } from "@/services";
import { UI_TRANSITIONS } from "@/types";
import type { Media } from "@/types";

export const Route = createFileRoute("/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings — E3 Digital Signage" },
      {
        name: "description",
        content: "Organisation, playback, sync and notification settings for the E3 signage network.",
      },
      { property: "og:title", content: "Settings — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Organisation, playback, sync and notification settings for the E3 signage network.",
      },
    ],
  }),
  component: SettingsPage,
});

const TABS = ["Organization", "Playback", "Sync", "Notifications"] as const;

function SettingsPage() {
  const { auth } = Route.useRouteContext();
  const canView = Boolean(auth?.ok && hasPermission(auth.profile.role, "settings.view"));
  const canManage = Boolean(auth?.ok && hasPermission(auth.profile.role, "settings.manage"));

  if (!canView) {
    return (
      <PermissionDenied
        title="Permission denied"
        description="Only Super Admins can open organization settings."
      />
    );
  }

  return <SettingsEditor canManage={canManage} />;
}

function SettingsEditor({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Organization");
  const [settings, setSettings] = useState(DEFAULT_CMS_SETTINGS);
  const { org, playback, sync, notify, publicCmsUrl } = settings;

  const [waitingTitle, setWaitingTitle] = useState("");
  const [waitingMessage, setWaitingMessage] = useState("");
  const [waitingMediaId, setWaitingMediaId] = useState<string | null>(null);
  const [waitingThumb, setWaitingThumb] = useState<string | null>(null);
  const [waitingMediaName, setWaitingMediaName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const orgSettingsQuery = useQuery({
    queryKey: ["organization-settings"],
    queryFn: async () => {
      const accessToken = await getBrowserAccessToken();
      return getOrganizationSettingsFn({ data: { accessToken } });
    },
  });

  const mediaQuery = useQuery({
    queryKey: ["media"],
    queryFn: () => mediaService.list(),
    enabled: pickerOpen,
  });
  const foldersQuery = useQuery({
    queryKey: ["media-folders"],
    queryFn: () => mediaService.listFolders(),
    enabled: pickerOpen,
  });

  const imageMedia = useMemo(
    () =>
      (mediaQuery.data ?? []).filter(
        (item) => item.type === "Image" || item.type === "Logo" || item.type === "QR",
      ),
    [mediaQuery.data],
  );

  useEffect(() => {
    setSettings(loadCmsSettings());
  }, []);

  useEffect(() => {
    const waiting = orgSettingsQuery.data?.waitingScreen;
    if (!waiting) return;
    setWaitingTitle(waiting.title ?? "");
    setWaitingMessage(waiting.message ?? "");
    setWaitingMediaId(waiting.mediaId);
    setWaitingThumb(waiting.thumbnailUrl);
    setWaitingMediaName(waiting.mediaName);
  }, [orgSettingsQuery.data]);

  const saveWaiting = useMutation({
    mutationFn: async () => {
      const accessToken = await getBrowserAccessToken();
      return updateWaitingScreenSettingsFn({
        data: {
          accessToken,
          mediaId: waitingMediaId,
          title: waitingTitle.trim() || null,
          message: waitingMessage.trim() || null,
        },
      });
    },
    onSuccess: (data) => {
      void qc.setQueryData(["organization-settings"], data);
      toast.success("Waiting screen saved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not save waiting screen");
    },
  });

  function saveLocal() {
    const next = saveCmsSettings(settings);
    setSettings(next);
    toast.success("Settings saved");
  }

  function save() {
    if (tab === "Playback") {
      if (!canManage) {
        toast.error("Permission denied");
        return;
      }
      saveLocal();
      saveWaiting.mutate();
      return;
    }
    saveLocal();
  }

  function pickMedia(item: Media) {
    setWaitingMediaId(item.id);
    setWaitingMediaName(item.filename);
    setWaitingThumb(item.thumbnailUrl ?? item.previewUrl ?? null);
    setPickerOpen(false);
  }

  function clearMedia() {
    setWaitingMediaId(null);
    setWaitingMediaName(null);
    setWaitingThumb(null);
  }

  return (
    <div>
      <E3PageHeader
        title="Settings"
        description="Network-wide defaults for the E3 signage admin panel."
        actions={
          <E3Button
            variant="primary"
            onClick={save}
            disabled={tab === "Playback" && (!canManage || saveWaiting.isPending)}
          >
            {saveWaiting.isPending ? "Saving…" : "Save changes"}
          </E3Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm",
              tab === t
                ? "e3-gradient border-transparent text-white"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <E3Card className="max-w-3xl">
        <E3CardHeader title={tab} />
        <E3CardBody className="space-y-5">
          {tab === "Organization" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="o-name">Organization name</Label>
                <Input
                  id="o-name"
                  value={org.name}
                  onChange={(e) => setSettings({ ...settings, org: { ...org, name: e.target.value } })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="o-cms">Public CMS / API URL</Label>
                <Input
                  id="o-cms"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder={DEFAULT_PUBLIC_CMS_URL}
                  value={publicCmsUrl}
                  onChange={(e) => setSettings({ ...settings, publicCmsUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Origin the TV player uses to pair and download manifests. No trailing slash.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-tz">Default time zone</Label>
                <Select
                  value={org.timezone}
                  onValueChange={(v) => setSettings({ ...settings, org: { ...org, timezone: v } })}
                >
                  <SelectTrigger id="o-tz">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Asia/Qatar", "Asia/Dubai", "Europe/London", "UTC"].map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-cur">Currency</Label>
                <Select
                  value={org.currency}
                  onValueChange={(v) => setSettings({ ...settings, org: { ...org, currency: v } })}
                >
                  <SelectTrigger id="o-cur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["QAR", "AED", "USD", "GBP"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {tab === "Playback" ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="p-dur">Default image duration (seconds)</Label>
                  <Input
                    id="p-dur"
                    type="number"
                    min={1}
                    value={playback.defaultDuration}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        playback: { ...playback, defaultDuration: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-tr">Default transition</Label>
                  <Select
                    value={playback.transition}
                    onValueChange={(v) =>
                      setSettings({ ...settings, playback: { ...playback, transition: v } })
                    }
                  >
                    <SelectTrigger id="p-tr">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UI_TRANSITIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ToggleRow
                id="p-loop"
                label="Loop playlists continuously"
                description="Restart the playlist automatically when it reaches the end."
                checked={playback.loop}
                onChange={(v) => setSettings({ ...settings, playback: { ...playback, loop: v } })}
              />
              <ToggleRow
                id="p-mute"
                label="Mute video audio by default"
                description="Recommended for screens in shared public areas."
                checked={playback.muteVideo}
                onChange={(v) =>
                  setSettings({ ...settings, playback: { ...playback, muteVideo: v } })
                }
              />

              <div className="space-y-4 rounded-xl border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Default waiting screen</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Shown on paired TVs until an active campaign package is playing. Leave blank to
                    keep the built-in E3 branded hold screen.
                  </p>
                </div>

                <div className="flex flex-wrap items-start gap-4">
                  <div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-border bg-muted">
                    {waitingThumb ? (
                      <img
                        src={waitingThumb}
                        alt={waitingMediaName ?? "Waiting screen"}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <ImageIcon className="size-8 opacity-60" aria-hidden />
                        <span className="text-xs">E3 branded default</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <E3Button
                      type="button"
                      variant="secondary"
                      disabled={!canManage || orgSettingsQuery.isLoading}
                      onClick={() => setPickerOpen(true)}
                    >
                      Choose image
                    </E3Button>
                    {waitingMediaId ? (
                      <E3Button
                        type="button"
                        variant="ghost"
                        disabled={!canManage}
                        onClick={clearMedia}
                      >
                        <X className="size-4" /> Clear image
                      </E3Button>
                    ) : null}
                    {waitingMediaName ? (
                      <p className="max-w-xs truncate text-xs text-muted-foreground">
                        {waitingMediaName}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="w-title">Headline (optional)</Label>
                    <Input
                      id="w-title"
                      maxLength={120}
                      placeholder="Waiting for the main act"
                      value={waitingTitle}
                      disabled={!canManage}
                      onChange={(e) => setWaitingTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-msg">Message (optional)</Label>
                    <Input
                      id="w-msg"
                      maxLength={500}
                      placeholder="This screen is online. Publish a campaign to take over."
                      value={waitingMessage}
                      disabled={!canManage}
                      onChange={(e) => setWaitingMessage(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "Sync" ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s-win">Nightly sync window</Label>
                  <Input
                    id="s-win"
                    type="time"
                    value={sync.window}
                    onChange={(e) =>
                      setSettings({ ...settings, sync: { ...sync, window: e.target.value } })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-ret">Download retry attempts</Label>
                  <Input
                    id="s-ret"
                    type="number"
                    min={0}
                    max={10}
                    value={sync.retries}
                    onChange={(e) =>
                      setSettings({ ...settings, sync: { ...sync, retries: e.target.value } })
                    }
                  />
                </div>
              </div>
              <ToggleRow
                id="s-auto"
                label="Auto-sync on publish"
                description="Push new campaign content to target screens immediately."
                checked={sync.autoSync}
                onChange={(v) => setSettings({ ...settings, sync: { ...sync, autoSync: v } })}
              />
              <ToggleRow
                id="s-wifi"
                label="Wi-Fi only downloads"
                description="Prevent large media downloads over cellular connections."
                checked={sync.wifiOnly}
                onChange={(v) => setSettings({ ...settings, sync: { ...sync, wifiOnly: v } })}
              />
            </div>
          ) : null}

          {tab === "Notifications" ? (
            <div className="space-y-5">
              <ToggleRow
                id="n-off"
                label="Screen offline alerts"
                description="Notify when a device stays offline for more than 15 minutes."
                checked={notify.offlineAlerts}
                onChange={(v) =>
                  setSettings({ ...settings, notify: { ...notify, offlineAlerts: v } })
                }
              />
              <ToggleRow
                id="n-sync"
                label="Sync failure alerts"
                description="Notify when a campaign fails to download on any screen."
                checked={notify.syncFailures}
                onChange={(v) =>
                  setSettings({ ...settings, notify: { ...notify, syncFailures: v } })
                }
              />
              <ToggleRow
                id="n-stor"
                label="Storage warnings"
                description="Notify when device storage exceeds 85%."
                checked={notify.storageWarnings}
                onChange={(v) =>
                  setSettings({ ...settings, notify: { ...notify, storageWarnings: v } })
                }
              />
              <ToggleRow
                id="n-dig"
                label="Weekly performance digest"
                description="Email a summary of plays, uptime and campaign performance."
                checked={notify.weeklyDigest}
                onChange={(v) =>
                  setSettings({ ...settings, notify: { ...notify, weeklyDigest: v } })
                }
              />
            </div>
          ) : null}
        </E3CardBody>
      </E3Card>

      <E3Modal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Choose waiting screen image"
        description="Pick an image from the media library. Videos are not supported here."
        className="sm:max-w-2xl"
      >
        <MediaPicker
          media={imageMedia}
          folders={foldersQuery.data ?? []}
          {...(waitingMediaId ? { selectedIds: new Set([waitingMediaId]) } : {})}
          onPick={pickMedia}
        />
      </E3Modal>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-border p-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}
