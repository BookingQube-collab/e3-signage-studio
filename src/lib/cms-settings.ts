/** Client-persisted CMS settings. The Settings page is still local-only. */

export const CMS_SETTINGS_STORAGE_KEY = "e3.cms.settings";
export const DEFAULT_PUBLIC_CMS_URL = "https://e3-cms.vercel.app";

export type CmsOrgSettings = {
  name: string;
  timezone: string;
  currency: string;
};

export type CmsPlaybackSettings = {
  defaultDuration: string;
  transition: string;
  loop: boolean;
  muteVideo: boolean;
};

export type CmsSyncSettings = {
  window: string;
  retries: string;
  wifiOnly: boolean;
  autoSync: boolean;
};

export type CmsNotifySettings = {
  offlineAlerts: boolean;
  syncFailures: boolean;
  storageWarnings: boolean;
  weeklyDigest: boolean;
};

export type CmsSettings = {
  publicCmsUrl: string;
  org: CmsOrgSettings;
  playback: CmsPlaybackSettings;
  sync: CmsSyncSettings;
  notify: CmsNotifySettings;
};

export const DEFAULT_CMS_SETTINGS: CmsSettings = {
  publicCmsUrl: DEFAULT_PUBLIC_CMS_URL,
  org: { name: "E3 Entertainment", timezone: "Asia/Qatar", currency: "QAR" },
  playback: { defaultDuration: "10", transition: "Fade", loop: true, muteVideo: true },
  sync: { window: "02:00", retries: "3", wifiOnly: true, autoSync: true },
  notify: {
    offlineAlerts: true,
    syncFailures: true,
    storageWarnings: false,
    weeklyDigest: true,
  },
};

/** Trim and drop a trailing slash so API bases stay Retrofit-safe. */
export function normalizePublicCmsUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function loadCmsSettings(): CmsSettings {
  if (typeof window === "undefined") return DEFAULT_CMS_SETTINGS;
  try {
    const raw = window.localStorage.getItem(CMS_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CMS_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CmsSettings>;
    return {
      publicCmsUrl: normalizePublicCmsUrl(parsed.publicCmsUrl ?? "") || DEFAULT_PUBLIC_CMS_URL,
      org: { ...DEFAULT_CMS_SETTINGS.org, ...parsed.org },
      playback: { ...DEFAULT_CMS_SETTINGS.playback, ...parsed.playback },
      sync: { ...DEFAULT_CMS_SETTINGS.sync, ...parsed.sync },
      notify: { ...DEFAULT_CMS_SETTINGS.notify, ...parsed.notify },
    };
  } catch {
    return DEFAULT_CMS_SETTINGS;
  }
}

export function saveCmsSettings(settings: CmsSettings): CmsSettings {
  const next: CmsSettings = {
    ...settings,
    publicCmsUrl: normalizePublicCmsUrl(settings.publicCmsUrl) || DEFAULT_PUBLIC_CMS_URL,
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CMS_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function getPublicCmsUrl(): string {
  return loadCmsSettings().publicCmsUrl;
}
