import { useQuery } from "@tanstack/react-query";
import { Copy, Download, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { E3Button } from "@/components/e3";
import { getPlayerApkDownloadFn } from "@/lib/settings-functions";
import { copyTextToClipboard, resolvePlayerApkHref } from "@/lib/player-apk";
import { getBrowserAccessToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const PLAYER_APK_QUERY_KEY = ["player-apk-download"] as const;

type PlayerApkDownloadCardProps = {
  /** Compact layout for pair dialog help. */
  compact?: boolean;
  className?: string;
};

export function PlayerApkDownloadCard({ compact = false, className }: PlayerApkDownloadCardProps) {
  const apkQuery = useQuery({
    queryKey: PLAYER_APK_QUERY_KEY,
    queryFn: async () => {
      const accessToken = await getBrowserAccessToken();
      return getPlayerApkDownloadFn({ data: { accessToken } });
    },
    staleTime: 60_000,
  });

  const configuredUrl = apkQuery.data?.url ?? null;
  const href =
    typeof window !== "undefined"
      ? resolvePlayerApkHref(configuredUrl, window.location.origin)
      : resolvePlayerApkHref(configuredUrl);
  const ready = Boolean(href);

  async function onCopy() {
    if (!href) return;
    const ok = await copyTextToClipboard(href);
    if (ok) toast.success("APK URL copied");
    else toast.error("Could not copy URL");
  }

  if (apkQuery.isLoading) {
    return (
      <div className={cn("rounded-xl border border-border p-4 text-sm text-muted-foreground", className)}>
        Loading player APK…
      </div>
    );
  }

  if (!ready) {
    if (compact) {
      return (
        <p className={cn("text-xs text-muted-foreground", className)}>
          No player APK URL configured. Super Admins can set{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem]">PLAYER_APK_URL</code> in
          Settings → Player.
        </p>
      );
    }
    return (
      <div className={cn("space-y-3 rounded-xl border border-dashed border-border p-4", className)}>
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-sm font-medium">Android TV player APK</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No download URL is configured yet. Host the APK (Cloudflare R2, CDN, or{" "}
              <code className="rounded bg-muted px-1 py-0.5">public/downloads/</code> on Vercel) and
              set one of:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li>
                <code className="rounded bg-muted px-1 py-0.5">PLAYER_APK_URL</code> (preferred,
                server)
              </li>
              <li>
                <code className="rounded bg-muted px-1 py-0.5">VITE_PLAYER_APK_URL</code> (local
                override)
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Build from <code className="rounded bg-muted px-1 py-0.5">apps/tv-player</code> →{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                dist/e3-signage-player-&lt;version&gt;-debug.apk
              </code>
              , then upload and point the env var at the public HTTPS URL (or a site path like{" "}
              <code className="rounded bg-muted px-1 py-0.5">/downloads/e3-signage-player.apk</code>
              ).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 rounded-xl border border-border p-4", className)}>
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-e3-purple" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Android TV player APK</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {compact
              ? "Download on a phone/laptop, or open the URL in the TV browser to install."
              : "Staff can download the APK or copy a direct URL to open in the TV browser (unknown sources required)."}
          </p>
          {!compact ? (
            <p className="mt-2 break-all font-mono text-[0.7rem] text-muted-foreground">{href}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <E3Button variant="primary" size={compact ? "sm" : "md"} asChild>
          <a href={href!} download target="_blank" rel="noopener noreferrer">
            <Download aria-hidden />
            Download APK
          </a>
        </E3Button>
        <E3Button type="button" variant="outline" size={compact ? "sm" : "md"} onClick={() => void onCopy()}>
          <Copy aria-hidden />
          Copy direct URL
        </E3Button>
      </div>
    </div>
  );
}
