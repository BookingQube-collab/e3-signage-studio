import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ImageIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { WaitingScreenBrand } from "@e3/shared-types";

import fullLogo from "@/assets/e3-full-logo.png";
import e3Icon from "@/assets/e3-icon.png";
import { PUBLIC_BRANDING_QUERY_KEY } from "@/components/branding/CmsBranding";
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
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasQueryClientContext } from "@/lib/router-preload";
import {
  getOrganizationSettingsFn,
  updateBrandingSettingsFn,
  updateWaitingScreenSettingsFn,
} from "@/lib/settings-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { mediaService } from "@/services";
import { UI_TRANSITIONS } from "@/types";
import type { Media } from "@/types";

const WAITING_BRAND_OPTIONS: ReadonlyArray<{
  value: WaitingScreenBrand;
  label: string;
  hint: string;
}> = [
  { value: "FULL_LOGO", label: "Full logo", hint: "Built-in E3 mark + wordmark" },
  { value: "ICON", label: "Brand icon", hint: "Player brand icon, or built-in E3 monogram" },
  { value: "CUSTOM", label: "Custom image", hint: "Full-bleed waiting background from media" },
];

type BrandingSlot =
  | "cmsLogo"
  | "favicon"
  | "playerBrandIcon"
  | "apkLauncherIcon"
  | "waiting";

export const Route = createFileRoute("/_shell/settings")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/settings");
  },
  head: () => ({
    meta: [
      { title: "Settings — E3 Digital Signage" },
      {
        name: "description",
        content: "Organisation, branding, playback, sync and notification settings for the E3 signage network.",
      },
      { property: "og:title", content: "Settings — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Organisation, branding, playback, sync and notification settings for the E3 signage network.",
      },
    ],
  }),
  component: SettingsPage,
});

const TABS = ["Organization", "Branding", "Playback", "Sync", "Notifications"] as const;

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

  const [waitingBrand, setWaitingBrand] = useState<WaitingScreenBrand>("FULL_LOGO");
  const [waitingTitle, setWaitingTitle] = useState("");
  const [waitingMessage, setWaitingMessage] = useState("");
  const [waitingMediaId, setWaitingMediaId] = useState<string | null>(null);
  const [waitingThumb, setWaitingThumb] = useState<string | null>(null);
  const [waitingMediaName, setWaitingMediaName] = useState<string | null>(null);

  const [cmsLogoId, setCmsLogoId] = useState<string | null>(null);
  const [cmsLogoThumb, setCmsLogoThumb] = useState<string | null>(null);
  const [cmsLogoName, setCmsLogoName] = useState<string | null>(null);
  const [faviconId, setFaviconId] = useState<string | null>(null);
  const [faviconThumb, setFaviconThumb] = useState<string | null>(null);
  const [faviconName, setFaviconName] = useState<string | null>(null);
  const [playerIconId, setPlayerIconId] = useState<string | null>(null);
  const [playerIconThumb, setPlayerIconThumb] = useState<string | null>(null);
  const [playerIconName, setPlayerIconName] = useState<string | null>(null);
  const [apkIconId, setApkIconId] = useState<string | null>(null);
  const [apkIconThumb, setApkIconThumb] = useState<string | null>(null);
  const [apkIconName, setApkIconName] = useState<string | null>(null);

  const [pickerSlot, setPickerSlot] = useState<BrandingSlot | null>(null);

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
    enabled: pickerSlot != null,
  });
  const foldersQuery = useQuery({
    queryKey: ["media-folders"],
    queryFn: () => mediaService.listFolders(),
    enabled: pickerSlot != null,
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
    if (waiting) {
      setWaitingBrand(waiting.brand ?? "FULL_LOGO");
      setWaitingTitle(waiting.title ?? "");
      setWaitingMessage(waiting.message ?? "");
      setWaitingMediaId(waiting.mediaId);
      setWaitingThumb(waiting.thumbnailUrl);
      setWaitingMediaName(waiting.mediaName);
    }
    const branding = orgSettingsQuery.data?.branding;
    if (branding) {
      setCmsLogoId(branding.cmsLogo.mediaId);
      setCmsLogoThumb(branding.cmsLogo.thumbnailUrl);
      setCmsLogoName(branding.cmsLogo.mediaName);
      setFaviconId(branding.favicon.mediaId);
      setFaviconThumb(branding.favicon.thumbnailUrl);
      setFaviconName(branding.favicon.mediaName);
      setPlayerIconId(branding.playerBrandIcon.mediaId);
      setPlayerIconThumb(branding.playerBrandIcon.thumbnailUrl);
      setPlayerIconName(branding.playerBrandIcon.mediaName);
      setApkIconId(branding.apkLauncherIcon.mediaId);
      setApkIconThumb(branding.apkLauncherIcon.thumbnailUrl);
      setApkIconName(branding.apkLauncherIcon.mediaName);
    }
  }, [orgSettingsQuery.data]);

  const saveWaiting = useMutation({
    mutationFn: async () => {
      const accessToken = await getBrowserAccessToken();
      return updateWaitingScreenSettingsFn({
        data: {
          accessToken,
          brand: waitingBrand,
          mediaId: waitingBrand === "CUSTOM" ? waitingMediaId : null,
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

  const saveBranding = useMutation({
    mutationFn: async () => {
      const accessToken = await getBrowserAccessToken();
      return updateBrandingSettingsFn({
        data: {
          accessToken,
          cmsLogoMediaId: cmsLogoId,
          faviconMediaId: faviconId,
          playerBrandIconMediaId: playerIconId,
          apkLauncherIconMediaId: apkIconId,
        },
      });
    },
    onSuccess: (data) => {
      void qc.setQueryData(["organization-settings"], data);
      void qc.invalidateQueries({ queryKey: PUBLIC_BRANDING_QUERY_KEY });
      toast.success("Branding saved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not save branding");
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
    if (tab === "Branding") {
      if (!canManage) {
        toast.error("Permission denied");
        return;
      }
      saveBranding.mutate();
      return;
    }
    saveLocal();
  }

  const saving =
    (tab === "Playback" && saveWaiting.isPending) ||
    (tab === "Branding" && saveBranding.isPending);

  function pickMedia(item: Media) {
    const thumb = item.thumbnailUrl ?? item.previewUrl ?? null;
    const name = item.filename;
    switch (pickerSlot) {
      case "cmsLogo":
        setCmsLogoId(item.id);
        setCmsLogoThumb(thumb);
        setCmsLogoName(name);
        break;
      case "favicon":
        setFaviconId(item.id);
        setFaviconThumb(thumb);
        setFaviconName(name);
        break;
      case "playerBrandIcon":
        setPlayerIconId(item.id);
        setPlayerIconThumb(thumb);
        setPlayerIconName(name);
        break;
      case "apkLauncherIcon":
        setApkIconId(item.id);
        setApkIconThumb(thumb);
        setApkIconName(name);
        break;
      case "waiting":
        setWaitingMediaId(item.id);
        setWaitingMediaName(name);
        setWaitingThumb(thumb);
        break;
      default:
        break;
    }
    setPickerSlot(null);
  }

  function clearWaitingMedia() {
    setWaitingMediaId(null);
    setWaitingMediaName(null);
    setWaitingThumb(null);
  }

  const pickerSelectedId =
    pickerSlot === "cmsLogo"
      ? cmsLogoId
      : pickerSlot === "favicon"
        ? faviconId
        : pickerSlot === "playerBrandIcon"
          ? playerIconId
          : pickerSlot === "apkLauncherIcon"
            ? apkIconId
            : pickerSlot === "waiting"
              ? waitingMediaId
              : null;

  const pickerTitle =
    pickerSlot === "cmsLogo"
      ? "Choose CMS logo"
      : pickerSlot === "favicon"
        ? "Choose favicon"
        : pickerSlot === "playerBrandIcon"
          ? "Choose player brand icon"
          : pickerSlot === "apkLauncherIcon"
            ? "Choose APK launcher icon reference"
            : "Choose waiting screen image";

  return (
    <div>
      <E3PageHeader
        title="Settings"
        description="Network-wide defaults for the E3 signage admin panel and TV players."
        actions={
          <E3Button
            variant="primary"
            onClick={save}
            disabled={
              ((tab === "Playback" || tab === "Branding") && !canManage) || saving
            }
          >
            {saving ? "Saving…" : "Save changes"}
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

          {tab === "Branding" ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Manage CMS and player brand assets from the media library. Falls back to the built-in
                E3 icon when empty.
              </p>

              <BrandAssetRow
                title="CMS logo"
                description="Sidebar, login, and headers in the admin panel."
                thumb={cmsLogoThumb}
                name={cmsLogoName}
                fallbackSrc={e3Icon}
                disabled={!canManage || orgSettingsQuery.isLoading}
                onChoose={() => setPickerSlot("cmsLogo")}
                onClear={() => {
                  setCmsLogoId(null);
                  setCmsLogoThumb(null);
                  setCmsLogoName(null);
                }}
              />

              <BrandAssetRow
                title="Favicon"
                description="Browser tab icon for the CMS, applied site-wide."
                thumb={faviconThumb}
                name={faviconName}
                fallbackSrc="/favicon.png"
                disabled={!canManage || orgSettingsQuery.isLoading}
                onChoose={() => setPickerSlot("favicon")}
                onClear={() => {
                  setFaviconId(null);
                  setFaviconThumb(null);
                  setFaviconName(null);
                }}
              />

              <BrandAssetRow
                title="Player brand icon (in-app)"
                description="Synced to paired TVs for waiting / idle screens when on-screen brand is Brand icon. Does not change the Android home-screen launcher icon at runtime."
                thumb={playerIconThumb}
                name={playerIconName}
                fallbackSrc={e3Icon}
                disabled={!canManage || orgSettingsQuery.isLoading}
                onChoose={() => setPickerSlot("playerBrandIcon")}
                onClear={() => {
                  setPlayerIconId(null);
                  setPlayerIconThumb(null);
                  setPlayerIconName(null);
                }}
              />

              <BrandAssetRow
                title="APK launcher icon (rebuild reference)"
                description="Stored for the next Android TV APK build. Installing a new APK is required for the home-screen launcher icon to change — runtime launcher replacement is not supported on Android TV."
                thumb={apkIconThumb}
                name={apkIconName}
                fallbackSrc={e3Icon}
                disabled={!canManage || orgSettingsQuery.isLoading}
                onChoose={() => setPickerSlot("apkLauncherIcon")}
                onClear={() => {
                  setApkIconId(null);
                  setApkIconThumb(null);
                  setApkIconName(null);
                }}
              />
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
                    Default image and content shown on paired TVs until an active campaign is playing.
                    Manage on-screen brand, optional headline/message, and a custom full-bleed image.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>On-screen brand</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {WAITING_BRAND_OPTIONS.map((option) => {
                      const selected = waitingBrand === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!canManage || orgSettingsQuery.isLoading}
                          onClick={() => setWaitingBrand(option.value)}
                          className={cn(
                            "rounded-lg border px-3 py-3 text-left transition-colors",
                            selected
                              ? "border-e3-purple bg-e3-purple/10"
                              : "border-border bg-background hover:border-muted-foreground/40",
                            !canManage && "cursor-not-allowed opacity-60",
                          )}
                        >
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-start gap-4">
                  <div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-border bg-black">
                    {waitingBrand === "CUSTOM" && waitingThumb ? (
                      <img
                        src={waitingThumb}
                        alt={waitingMediaName ?? "Waiting screen"}
                        className="size-full object-cover"
                      />
                    ) : waitingBrand === "ICON" ? (
                      <div className="flex size-full items-center justify-center p-6">
                        <img
                          src={playerIconThumb || e3Icon}
                          alt="Brand icon"
                          className="max-h-full w-auto object-contain"
                        />
                      </div>
                    ) : waitingBrand === "FULL_LOGO" ? (
                      <div className="flex size-full items-center justify-center p-4">
                        <img
                          src={fullLogo}
                          alt="E3 full logo"
                          className="max-h-full w-auto object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <ImageIcon className="size-8 opacity-60" aria-hidden />
                        <span className="text-xs">Choose a custom image</span>
                      </div>
                    )}
                  </div>
                  {waitingBrand === "CUSTOM" ? (
                    <div className="flex flex-col gap-2">
                      <E3Button
                        type="button"
                        variant="secondary"
                        disabled={!canManage || orgSettingsQuery.isLoading}
                        onClick={() => setPickerSlot("waiting")}
                      >
                        Choose default image
                      </E3Button>
                      {waitingMediaId ? (
                        <E3Button
                          type="button"
                          variant="ghost"
                          disabled={!canManage}
                          onClick={clearWaitingMedia}
                        >
                          <X className="size-4" /> Clear image
                        </E3Button>
                      ) : null}
                      {waitingMediaName ? (
                        <p className="max-w-xs truncate text-xs text-muted-foreground">
                          {waitingMediaName}
                        </p>
                      ) : (
                        <p className="max-w-xs text-xs text-muted-foreground">
                          Without an image, TVs fall back to the full logo.
                        </p>
                      )}
                    </div>
                  ) : waitingBrand === "ICON" ? (
                    <p className="max-w-xs text-xs text-muted-foreground">
                      Uses the Player brand icon from the Branding tab when set; otherwise the built-in
                      E3 monogram.
                    </p>
                  ) : null}
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
                    <Label htmlFor="w-msg">Message / content (optional)</Label>
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
        open={pickerSlot != null}
        onOpenChange={(open) => {
          if (!open) setPickerSlot(null);
        }}
        title={pickerTitle}
        description="Pick an image from the media library. Videos are not supported here."
        className="sm:max-w-2xl"
      >
        <MediaPicker
          media={imageMedia}
          folders={foldersQuery.data ?? []}
          {...(pickerSelectedId ? { selectedIds: new Set([pickerSelectedId]) } : {})}
          onPick={pickMedia}
        />
      </E3Modal>
    </div>
  );
}

function BrandAssetRow({
  title,
  description,
  thumb,
  name,
  fallbackSrc,
  disabled,
  onChoose,
  onClear,
}: {
  title: string;
  description: string;
  thumb: string | null;
  name: string | null;
  fallbackSrc: string;
  disabled: boolean;
  onChoose: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-xl border border-border p-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 p-2">
        <img
          src={thumb || fallbackSrc}
          alt={name ?? title}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <E3Button type="button" variant="secondary" disabled={disabled} onClick={onChoose}>
            Choose image
          </E3Button>
          {thumb ? (
            <E3Button type="button" variant="ghost" disabled={disabled} onClick={onClear}>
              <X className="size-4" /> Clear
            </E3Button>
          ) : null}
        </div>
        {name ? (
          <p className="truncate text-xs text-muted-foreground">{name}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Using built-in default</p>
        )}
      </div>
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
