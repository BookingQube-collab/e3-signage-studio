import { randomUUID } from "node:crypto";

import {
  FIT_MODES,
  LAYOUT_ORIENTATIONS,
  LAYOUT_PRESETS,
  ZONE_CONTENT_TYPES,
  type FitMode,
  type LayoutPreset,
  type Orientation,
  type ZoneContentType,
} from "@e3/shared-types";

import {
  parseLayoutResolution,
  toDeviceLayoutJson,
  zonePercentForDb,
} from "@/lib/layout-pixels";
import { isUuid } from "@/services/inventory-map";
import type { LayoutRecord, LayoutZoneRecord } from "@/services/layout-map";
import { requireCmsPermission } from "./auth.server";
import { assertCanMutateOwnedContent, contentVisibleToProfile } from "@/lib/location-scope";
import { loadScopedContentUsage } from "./scoped-content.server";
import { getUserClient } from "./supabase.server";

const LAYOUT_SELECT =
  "id, organization_id, name, preset, orientation, width_px, height_px, background, archived_at, created_at, updated_at, created_by";
const LAYOUT_SELECT_NO_CREATED_BY =
  "id, organization_id, name, preset, orientation, width_px, height_px, background, archived_at, created_at, updated_at";
const ZONE_SELECT =
  "id, layout_id, name, type, x_percent, y_percent, width_percent, height_percent, content_ref, fit, background, duration_seconds, sort_order";

export type LayoutZoneInput = {
  id: string;
  name: string;
  type: ZoneContentType;
  x: number;
  y: number;
  width: number;
  height: number;
  contentRef: string | null;
  fit: FitMode;
  background: string;
  durationSec: number;
};

function throwIfError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function isUnknownColumn(error: { message: string } | null, column: string): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes(column.toLowerCase()) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find"))
  );
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isPreset(value: string): value is LayoutPreset {
  return (LAYOUT_PRESETS as readonly string[]).includes(value);
}

function isOrientation(value: string): value is Orientation {
  return (LAYOUT_ORIENTATIONS as readonly string[]).includes(value);
}

function isFit(value: string): value is FitMode {
  return (FIT_MODES as readonly string[]).includes(value);
}

function isZoneType(value: string): value is ZoneContentType {
  return (ZONE_CONTENT_TYPES as readonly string[]).includes(value);
}

function dateLabel(iso: string): string {
  return iso.slice(0, 10);
}

async function resolveContentRefs(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  refs: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(refs.filter((ref): ref is string => Boolean(ref)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const ids = unique.filter(isUuid);
  const names = unique.filter((ref) => !isUuid(ref));
  const [byId, byName] = await Promise.all([
    ids.length
      ? client.from("media").select("id, name").eq("organization_id", organizationId).in("id", ids)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    names.length
      ? client.from("media").select("id, name").eq("organization_id", organizationId).in("name", names)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  for (const row of byId.data ?? []) {
    const id = asString((row as { id: string }).id);
    const name = asString((row as { name: string }).name);
    map.set(id, id);
    if (name) map.set(name, id);
  }
  for (const row of byName.data ?? []) {
    const id = asString((row as { id: string }).id);
    const name = asString((row as { name: string }).name);
    if (name && !map.has(name)) map.set(name, id);
  }
  return map;
}

async function toRecords(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  rows: Array<Record<string, unknown>>,
): Promise<LayoutRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => asString(row["id"]));
  const [{ data: zoneRows }, { data: itemRows }] = await Promise.all([
    client.from("layout_zones").select(ZONE_SELECT).in("layout_id", ids).order("sort_order"),
    client.from("playlist_items").select("layout_id").in("layout_id", ids),
  ]);

  const refs = (zoneRows ?? []).map((row) => asNullableString((row as { content_ref: string | null }).content_ref));
  const resolved = await resolveContentRefs(client, organizationId, refs);
  const reverseName = new Map<string, string>();
  const mediaIds = [...new Set([...resolved.values()])];
  if (mediaIds.length > 0) {
    const { data: mediaRows } = await client.from("media").select("id, name").in("id", mediaIds);
    for (const row of mediaRows ?? []) {
      reverseName.set(asString((row as { id: string }).id), asString((row as { name: string }).name));
    }
  }

  const used = new Map<string, number>();
  for (const row of itemRows ?? []) {
    const layoutId = asString((row as { layout_id: string }).layout_id);
    used.set(layoutId, (used.get(layoutId) ?? 0) + 1);
  }

  const zonesByLayout = new Map<string, LayoutZoneRecord[]>();
  for (const raw of zoneRows ?? []) {
    const row = raw as Record<string, unknown>;
    const layoutId = asString(row["layout_id"]);
    const type = asString(row["type"]);
    const fit = asString(row["fit"]);
    const storedRef = asNullableString(row["content_ref"]);
    const mediaId = storedRef ? (resolved.get(storedRef) ?? (isUuid(storedRef) ? storedRef : null)) : null;
    const zone: LayoutZoneRecord = {
      id: asString(row["id"]),
      name: asString(row["name"]),
      type: isZoneType(type) ? type : "IMAGE",
      x: asNumber(row["x_percent"]),
      y: asNumber(row["y_percent"]),
      width: asNumber(row["width_percent"]),
      height: asNumber(row["height_percent"]),
      contentRef: mediaId ? (reverseName.get(mediaId) ?? storedRef) : storedRef,
      fit: isFit(fit) ? fit : "CONTAIN",
      background: asString(row["background"], "#252229"),
      durationSec: asNumber(row["duration_seconds"], 15),
    };
    const list = zonesByLayout.get(layoutId) ?? [];
    list.push(zone);
    zonesByLayout.set(layoutId, list);
  }

  return rows
    .filter((row) => !row["archived_at"])
    .map((row) => {
      const preset = asString(row["preset"]);
      const orientation = asString(row["orientation"]);
      return {
        id: asString(row["id"]),
        name: asString(row["name"]),
        preset: isPreset(preset) ? preset : "CUSTOM",
        orientation: isOrientation(orientation) ? orientation : "LANDSCAPE",
        widthPx: asNumber(row["width_px"], 1920),
        heightPx: asNumber(row["height_px"], 1080),
        background: asString(row["background"], "#19161A"),
        zones: zonesByLayout.get(asString(row["id"])) ?? [],
        usedByScreens: used.get(asString(row["id"])) ?? 0,
        modifiedAt: dateLabel(asString(row["updated_at"])),
      };
    });
}

export async function listLayouts(accessToken: string): Promise<LayoutRecord[]> {
  const auth = await requireCmsPermission(accessToken, "layouts.view");
  const client = getUserClient(accessToken);
  const [first, usage] = await Promise.all([
    client
      .from("layouts")
      .select(LAYOUT_SELECT)
      .eq("organization_id", auth.profile.organizationId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
    loadScopedContentUsage(client, auth.profile),
  ]);
  const retry = isUnknownColumn(first.error, "created_by")
    ? await client
        .from("layouts")
        .select(LAYOUT_SELECT_NO_CREATED_BY)
        .eq("organization_id", auth.profile.organizationId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
    : first;
  throwIfError(retry.error, "Could not load layouts.");
  const rows = ((retry.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
    contentVisibleToProfile(
      auth.profile,
      asNullableString(row["created_by"]),
      usage.layoutIds.has(asString(row["id"])),
    ),
  );
  return toRecords(client, auth.profile.organizationId, rows);
}

export async function getLayout(accessToken: string, id: string): Promise<LayoutRecord | null> {
  const auth = await requireCmsPermission(accessToken, "layouts.view");
  if (!isUuid(id)) return null;
  const client = getUserClient(accessToken);
  const first = await client
    .from("layouts")
    .select(LAYOUT_SELECT)
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null)
    .maybeSingle();
  const retry = isUnknownColumn(first.error, "created_by")
    ? await client
        .from("layouts")
        .select(LAYOUT_SELECT_NO_CREATED_BY)
        .eq("id", id)
        .eq("organization_id", auth.profile.organizationId)
        .is("archived_at", null)
        .maybeSingle()
    : first;
  throwIfError(retry.error, "Could not load layout.");
  if (!retry.data) return null;
  const usage = await loadScopedContentUsage(client, auth.profile);
  const row = retry.data as Record<string, unknown>;
  if (
    !contentVisibleToProfile(
      auth.profile,
      asNullableString(row["created_by"]),
      usage.layoutIds.has(asString(row["id"])),
    )
  ) {
    return null;
  }
  const records = await toRecords(client, auth.profile.organizationId, [row]);
  return records[0] ?? null;
}

export async function saveLayout(
  accessToken: string,
  input: {
    id: string;
    name: string;
    preset: LayoutPreset;
    orientation: Orientation;
    resolution: string;
    background: string;
    zones: LayoutZoneInput[];
  },
): Promise<LayoutRecord> {
  const auth = await requireCmsPermission(accessToken, "layouts.manage");
  const client = getUserClient(accessToken);
  const name = input.name.trim();
  if (!name) throw new Error("Name your layout before saving.");
  if (input.zones.length === 0) throw new Error("A layout needs at least one zone.");

  const size = parseLayoutResolution(input.resolution, input.orientation);
  const refs = input.zones.map((zone) => zone.contentRef);
  const resolved = await resolveContentRefs(client, auth.profile.organizationId, refs);

  const zones = input.zones.map((zone, index) => {
    const id = isUuid(zone.id) ? zone.id : randomUUID();
    const rawRef = zone.contentRef?.trim() || null;
    const contentRef = rawRef ? (resolved.get(rawRef) ?? rawRef) : null;
    return {
      id,
      layout_id: "",
      name: zone.name.trim() || `Zone ${index + 1}`,
      type: zone.type,
      x_percent: zonePercentForDb(zone.x, { min: 0 }),
      y_percent: zonePercentForDb(zone.y, { min: 0 }),
      width_percent: zonePercentForDb(zone.width, { min: 0.1 }),
      height_percent: zonePercentForDb(zone.height, { min: 0.1 }),
      content_ref: contentRef,
      fit: zone.fit,
      background: zone.background || "#252229",
      duration_seconds: Math.max(0, zone.durationSec),
      sort_order: index,
    };
  });

  const existingId = isUuid(input.id) ? input.id : null;
  let layoutId = existingId;
  const layoutFields = {
    name,
    preset: input.preset,
    orientation: input.orientation,
    width_px: size.widthPx,
    height_px: size.heightPx,
    background: input.background || "#19161A",
  };

  if (existingId) {
    const { data: existing, error: existingError } = await client
      .from("layouts")
      .select("id, created_by")
      .eq("id", existingId)
      .eq("organization_id", auth.profile.organizationId)
      .maybeSingle();
    throwIfError(existingError, "Could not load layout.");
    if (!existing) throw new Error("Layout not found.");
    assertCanMutateOwnedContent(
      auth.profile,
      asNullableString((existing as { created_by: string | null }).created_by),
    );
    const { error: updateError } = await client.from("layouts").update(layoutFields).eq("id", existingId);
    throwIfError(updateError, "Could not save layout.");
  } else {
    const { data, error } = await client
      .from("layouts")
      .insert({
        ...layoutFields,
        organization_id: auth.profile.organizationId,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    throwIfError(error, "Could not create layout.");
    layoutId = asString((data as { id: string }).id);
  }
  if (!layoutId) throw new Error("Could not save layout.");

  const { error: deleteError } = await client.from("layout_zones").delete().eq("layout_id", layoutId);
  throwIfError(deleteError, "Could not update layout zones.");
  const { error: insertError } = await client.from("layout_zones").insert(
    zones.map((zone) => ({ ...zone, layout_id: layoutId })),
  );
  throwIfError(insertError, "Could not save layout zones.");

  const deviceJson = toDeviceLayoutJson({
    widthPx: size.widthPx,
    heightPx: size.heightPx,
    orientation: input.orientation,
    background: layoutFields.background,
    zones: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      type: zone.type,
      xPercent: zone.x_percent,
      yPercent: zone.y_percent,
      widthPercent: zone.width_percent,
      heightPercent: zone.height_percent,
      fit: zone.fit,
      contentRef: zone.content_ref,
      background: zone.background,
      durationSeconds: zone.duration_seconds,
    })),
  });
  const { error: jsonError } = await client.from("layouts").update({ device_json: deviceJson }).eq("id", layoutId);
  if (jsonError && !isUnknownColumn(jsonError, "device_json")) {
    throwIfError(jsonError, "Could not save layout pixel JSON.");
  }

  if (isUuid(layoutId)) {
    try {
      const { republishScreensUsingLayout } = await import("./campaigns.server");
      await republishScreensUsingLayout(accessToken, layoutId);
    } catch (error) {
      console.error(
        "[layouts] republish after save failed",
        layoutId,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const saved = await getLayout(accessToken, layoutId);
  if (!saved) throw new Error("Layout not found.");
  return saved;
}

export async function archiveLayout(accessToken: string, id: string): Promise<boolean> {
  if (!isUuid(id)) throw new Error("Layout not found.");
  const existing = await getLayout(accessToken, id);
  if (!existing) throw new Error("Layout not found.");
  const auth = await requireCmsPermission(accessToken, "layouts.manage");
  const client = getUserClient(accessToken);
  const { data: row, error: loadError } = await client
    .from("layouts")
    .select("id, created_by")
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId)
    .maybeSingle();
  throwIfError(loadError, "Could not load layout.");
  if (!row) throw new Error("Layout not found.");
  assertCanMutateOwnedContent(
    auth.profile,
    asNullableString((row as { created_by: string | null }).created_by),
  );

  const [{ count: campaignCount, error: campaignError }, { count: itemCount, error: itemError }] =
    await Promise.all([
      client
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("layout_id", id)
        .is("archived_at", null),
      client.from("playlist_items").select("id", { count: "exact", head: true }).eq("layout_id", id),
    ]);
  throwIfError(campaignError, "Could not check campaigns using this layout.");
  throwIfError(itemError, "Could not check playlists using this layout.");
  if ((campaignCount ?? 0) > 0 || (itemCount ?? 0) > 0) {
    throw new Error("Remove this layout from campaigns and playlists before deleting it.");
  }

  const { error } = await client
    .from("layouts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId);
  throwIfError(error, "Could not delete layout.");
  return true;
}
