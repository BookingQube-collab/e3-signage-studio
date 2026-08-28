import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import fallbackLogo from "@/assets/e3-icon.png";

export const PUBLIC_BRANDING_QUERY_KEY = ["public-branding"] as const;

export type PublicBranding = {
  logoUrl: string | null;
  faviconUrl: string | null;
  version: number;
};

async function fetchPublicBranding(): Promise<PublicBranding> {
  const res = await fetch("/api/branding", { credentials: "same-origin" });
  if (!res.ok) {
    return { logoUrl: null, faviconUrl: null, version: 1 };
  }
  return (await res.json()) as PublicBranding;
}

export function usePublicBranding() {
  return useQuery({
    queryKey: PUBLIC_BRANDING_QUERY_KEY,
    queryFn: fetchPublicBranding,
    staleTime: 60_000,
  });
}

/** Resolves CMS logo URL with bundled E3 icon fallback. */
export function useCmsLogoSrc(): string {
  const { data } = usePublicBranding();
  return data?.logoUrl || fallbackLogo;
}

/** Applies admin-managed favicon site-wide; falls back to /favicon.png. */
export function CmsFavicon() {
  const { data } = usePublicBranding();

  useEffect(() => {
    const href = data?.faviconUrl || "/favicon.png";
    const version = data?.version ?? 1;
    const withCache = href.startsWith("http") ? href : `${href}?v=${version}`;

    let link = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-cms-branding='1']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.dataset.cmsBranding = "1";
      document.head.appendChild(link);
    }
    link.href = withCache;

    for (const existing of document.querySelectorAll<HTMLLinkElement>("link[rel='icon']")) {
      if (existing === link) continue;
      if (!existing.dataset.cmsBranding) {
        existing.remove();
      }
    }
  }, [data?.faviconUrl, data?.version]);

  return null;
}
