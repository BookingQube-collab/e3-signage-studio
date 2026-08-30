/**
 * Shared CMS preview orientation helpers for screen Current content and
 * campaign on-screen preview. Accepts UI labels ("Portrait") and canonical
 * enums ("PORTRAIT" / "PORTRAIT_UPSIDE_DOWN").
 */

export type PreviewAspect = "9 / 16" | "16 / 9";

/** Portrait and Portrait (upside down) share a tall 9:16 preview frame. */
export function isPreviewPortrait(orientation: string | null | undefined): boolean {
  const value = (orientation ?? "").trim().toUpperCase().replace(/[\s()-]+/g, "_");
  return value === "PORTRAIT" || value === "PORTRAIT_UPSIDE_DOWN" || value.startsWith("PORTRAIT_");
}

/** Landscape and Landscape (upside down) share a wide 16:9 preview frame. */
export function isPreviewLandscape(orientation: string | null | undefined): boolean {
  const value = (orientation ?? "").trim().toUpperCase().replace(/[\s()-]+/g, "_");
  return (
    value === "LANDSCAPE" ||
    value === "LANDSCAPE_UPSIDE_DOWN" ||
    value.startsWith("LANDSCAPE_") ||
    (!isPreviewPortrait(orientation) && Boolean(orientation))
  );
}

/** Upside-down mounts can optionally rotate the preview chrome 180°. */
export function isPreviewUpsideDown(orientation: string | null | undefined): boolean {
  const value = (orientation ?? "").trim().toUpperCase();
  return value.includes("UPSIDE");
}

export function previewAspectRatio(orientation: string | null | undefined): PreviewAspect {
  return isPreviewPortrait(orientation) ? "9 / 16" : "16 / 9";
}

/**
 * Resolve campaign wizard preview orientation from selected target screens.
 *
 * Rule: if any selected screen is portrait (incl. upside down), use the first
 * portrait screen's orientation so vertical campaigns get a tall frame.
 * Otherwise use the first selected screen. Falls back to layoutOrientation
 * (for layout content), then Landscape.
 */
export function resolveCampaignPreviewOrientation(
  screenOrientations: Array<string | null | undefined>,
  layoutOrientation?: string | null,
): string {
  const cleaned = screenOrientations.filter((o): o is string => Boolean(o?.trim()));
  const portrait = cleaned.find((o) => isPreviewPortrait(o));
  if (portrait) return portrait;
  if (cleaned[0]) return cleaned[0];
  if (layoutOrientation?.trim()) return layoutOrientation;
  return "Landscape";
}
