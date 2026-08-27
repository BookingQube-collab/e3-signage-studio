/**
 * One-off production seed for CMS sidebar click-through.
 * Does not unpair, disable, or republish Inflata - Rajan Office Screen.
 * Run: node scripts/seed-cms-sidebar.mjs
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS_DIR = "C:\\Users\\patha\\.cursor\\projects\\a-Live-Projects-E3-Signage-Studio\\assets";

const NAMES = {
  welcome: "ninjago-welcome-special-day.jpg",
  poppy: "ninjago-happy-6th-birthday-poppy.jpg",
  playlist: "Poppy Birthday",
  layout: "Party room — main + ticker",
  campaign: "Poppy Birthday (demo — not on TCL)",
  dummyScreen: "Demo Screen (no player)",
  groupLobby: "Lobby TVs",
  groupParty: "Party rooms",
  warehouse: "Warehouse demo",
};

function loadEnv(path) {
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function must(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing ${key} in .env`);
  return value;
}

function optional(env, key) {
  const value = env[key]?.trim();
  return value || "";
}

function throwIf(error, fallback) {
  if (error) throw new Error(error.message || fallback);
}

function projectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "(unknown)";
  } catch {
    return "(unknown)";
  }
}

function findAsset(needle) {
  const match = readdirSync(ASSETS_DIR).find(
    (name) => name.toLowerCase().includes(needle.toLowerCase()) && name.toLowerCase().endsWith(".jpg"),
  );
  if (!match) throw new Error(`Could not find asset matching ${needle}`);
  return join(ASSETS_DIR, match);
}

function jpegSize(buf) {
  let i = 2;
  while (i + 8 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const size = (buf[i + 2] << 8) | buf[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: (buf[i + 5] << 8) | buf[i + 6], width: (buf[i + 7] << 8) | buf[i + 8] };
    }
    i += 2 + size;
  }
  return { width: null, height: null };
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalObjectPath(bucketAndKey) {
  return `/${bucketAndKey.split("/").map(encodeRfc3986).join("/")}`;
}

function signingKey(secret, dateStamp, region) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function r2SignedUrl({ method, key, expiresIn, contentType, endpoint, bucket, accessKeyId, secretAccessKey }) {
  const now = new Date();
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = iso.slice(0, 8);
  const host = new URL(endpoint).host;
  const region = "auto";
  const credential = `${accessKeyId}/${dateStamp}/${region}/s3/aws4_request`;
  const signedHeaders = contentType ? "content-type;host" : "host";
  const query = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", iso],
    ["X-Amz-Expires", String(expiresIn)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = query.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join("&");
  const canonicalHeaders = contentType ? `content-type:${contentType}\nhost:${host}\n` : `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalObjectPath(`${bucket}/${key}`),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    iso,
    `${dateStamp}/${region}/s3/aws4_request`,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(secretAccessKey, dateStamp, region))
    .update(stringToSign, "utf8")
    .digest("hex");
  const encodedKey = key.split("/").map(encodeRfc3986).join("/");
  const url = `${endpoint.replace(/\/+$/, "")}/${bucket}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const headers = {};
  if (contentType) headers["Content-Type"] = contentType;
  return { url, headers };
}

function percentToPx(percent, total) {
  if (!Number.isFinite(percent) || !Number.isFinite(total) || total <= 0) return 0;
  const px = Math.round((Math.min(100, Math.max(0, percent)) / 100) * total);
  return Math.min(total, Math.max(0, px));
}

async function one(query, fallback) {
  const { data, error } = await query.maybeSingle();
  throwIf(error, fallback);
  return data;
}

async function many(query, fallback) {
  const { data, error } = await query;
  throwIf(error, fallback);
  return data ?? [];
}

async function snapshotLive(admin, live) {
  const playlist = live.current_playlist_id
    ? await one(admin.from("playlists").select("id, name").eq("id", live.current_playlist_id), "playlist")
    : null;
  const pairing = await many(
    admin.from("device_pairing_codes").select("id, consumed_at, screen_id").eq("screen_id", live.id),
    "pairing",
  );
  const targets = await many(
    admin.from("campaign_targets").select("campaign_id, type, target_id").eq("target_id", live.id),
    "targets",
  );
  return {
    id: live.id,
    name: live.name,
    device_id: live.device_id,
    operational_status: live.operational_status,
    current_playlist_id: live.current_playlist_id,
    playlist_name: playlist?.name ?? null,
    cloud_manifest_version: live.cloud_manifest_version,
    archived_at: live.archived_at,
    pairing_consumed: pairing.map((row) => Boolean(row.consumed_at)),
    campaign_target_ids: targets.map((row) => row.campaign_id).sort(),
  };
}

async function uploadObject(admin, storage, storageKey, bytes) {
  if (storage.backend === "r2") {
    const signed = r2SignedUrl({
      method: "PUT",
      key: storageKey,
      expiresIn: 15 * 60,
      contentType: "image/jpeg",
      ...storage.r2,
    });
    const put = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: bytes });
    if (!put.ok) throw new Error(`R2 upload failed (${put.status})`);
    return;
  }
  const { error } = await admin.storage.from("media").upload(storageKey, bytes, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

async function objectUrl(admin, storage, storageKey) {
  if (storage.backend === "r2") {
    return r2SignedUrl({ method: "GET", key: storageKey, expiresIn: 60 * 60, ...storage.r2 }).url;
  }
  const { data, error } = await admin.storage.from("media").createSignedUrl(storageKey, 3600);
  throwIf(error, "signed url");
  return data?.signedUrl ?? "";
}

async function ensureMedia(admin, { orgId, userId, filename, filePath, storage }) {
  const existing = await one(
    admin.from("media").select("id, name, status, current_version_id").eq("organization_id", orgId).eq("name", filename),
    "media lookup",
  );
  const bytes = readFileSync(filePath);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const { width, height } = jpegSize(bytes);
  const sizeBytes = bytes.length;

  if (existing?.status === "READY" && existing.current_version_id) {
    const version = await one(
      admin.from("media_versions").select("id, storage_key, checksum_sha256").eq("id", existing.current_version_id),
      "version lookup",
    );
    return {
      id: existing.id,
      name: filename,
      created: false,
      storageKey: version?.storage_key ?? null,
      checksum: version?.checksum_sha256 ?? checksum,
    };
  }

  let mediaId = existing?.id;
  if (!mediaId) {
    const { data, error } = await admin
      .from("media")
      .insert({
        organization_id: orgId,
        name: filename,
        type: "IMAGE",
        mime_type: "image/jpeg",
        status: "PROCESSING",
        created_by: userId,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    throwIf(error, "create media");
    mediaId = data.id;
  }

  const versionNumber = 1;
  const storageKey = `${orgId}/${mediaId}/v${versionNumber}/${checksum}.jpg`;
  await uploadObject(admin, storage, storageKey, bytes);

  const { data: version, error: versionError } = await admin
    .from("media_versions")
    .insert({
      media_id: mediaId,
      version_number: versionNumber,
      storage_key: storageKey,
      thumbnail_key: storageKey,
      size_bytes: sizeBytes,
      width,
      height,
      duration_ms: null,
      checksum_sha256: checksum,
      mime_type: "image/jpeg",
      status: "READY",
      created_by: userId,
    })
    .select("id")
    .single();
  throwIf(versionError, "create media version");

  const { error: readyError } = await admin
    .from("media")
    .update({
      status: "READY",
      current_version_id: version.id,
      mime_type: "image/jpeg",
      uploaded_by: userId,
    })
    .eq("id", mediaId);
  throwIf(readyError, "finalize media");

  return { id: mediaId, name: filename, created: true, storageKey, checksum };
}

async function ensureNamed(admin, table, match, insert) {
  const existing = await one(admin.from(table).select("*").match(match), `${table} lookup`);
  if (existing) return { row: existing, created: false };
  const { data, error } = await admin.from(table).insert(insert).select("*").single();
  throwIf(error, `create ${table}`);
  return { row: data, created: true };
}

async function main() {
  const env = loadEnv(join(ROOT, ".env"));
  const supabaseUrl = must(env, "SUPABASE_URL");
  const serviceKey = must(env, "SUPABASE_SERVICE_ROLE_KEY");
  const r2Configured = Boolean(
    optional(env, "R2_ENDPOINT") &&
      optional(env, "R2_BUCKET") &&
      optional(env, "R2_ACCESS_KEY_ID") &&
      optional(env, "R2_SECRET_ACCESS_KEY"),
  );
  const storage = r2Configured
    ? {
        backend: "r2",
        r2: {
          endpoint: must(env, "R2_ENDPOINT"),
          bucket: must(env, "R2_BUCKET"),
          accessKeyId: must(env, "R2_ACCESS_KEY_ID"),
          secretAccessKey: must(env, "R2_SECRET_ACCESS_KEY"),
        },
      }
    : { backend: "supabase" };
  const created = [];
  const skipped = [];
  const notes = [];
  notes.push(
    storage.backend === "r2"
      ? "Media uploaded to Cloudflare R2 (same path as CMS)."
      : "Local R2 keys are empty; media uploaded to the private Supabase Storage bucket `media` (CMS fallback).",
  );

  console.log(`Supabase project: ${projectRef(supabaseUrl)}`);
  if (projectRef(supabaseUrl) !== "auqcqdkcuwkzvefahyqu") {
    throw new Error("Refusing to seed: SUPABASE_URL is not the expected production project.");
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const inflata = await one(
    admin.from("locations").select("id, organization_id, name, code, status").eq("name", "InflataPark"),
    "InflataPark",
  );
  if (!inflata) throw new Error("InflataPark location not found.");
  const orgId = inflata.organization_id;

  const live = await one(
    admin
      .from("screens")
      .select(
        "id, name, device_id, operational_status, current_playlist_id, cloud_manifest_version, archived_at, location_id, organization_id",
      )
      .eq("location_id", inflata.id)
      .not("device_id", "is", null)
      .is("archived_at", null),
    "live screen",
  );
  if (!live) throw new Error("Paired Inflata / Rajan screen not found.");
  const archivedOffice = await one(
    admin
      .from("screens")
      .select("id, name, device_id, operational_status, archived_at")
      .eq("name", "Inflata - Rajan Office Screen"),
    "archived office screen",
  );

  const before = await snapshotLive(admin, live);
  console.log("Live TV snapshot (before):", JSON.stringify(before, null, 2));

  const users = await many(
    admin.from("users").select("id, name, email, role, status").eq("organization_id", orgId).order("created_at"),
    "users",
  );
  const actor = users.find((u) => u.role === "SUPER_ADMIN" && u.status === "ACTIVE") ?? users[0];
  if (!actor) throw new Error("No CMS user found to attribute created_by.");
  const userId = actor.id;

  const locations = await many(
    admin.from("locations").select("id, name, code, status").eq("organization_id", orgId).is("archived_at", null),
    "locations",
  );
  const playlists = await many(
    admin.from("playlists").select("id, name, status").eq("organization_id", orgId).is("archived_at", null),
    "playlists",
  );
  const campaigns = await many(
    admin.from("campaigns").select("id, name, status, playlist_id").eq("organization_id", orgId).is("archived_at", null),
    "campaigns",
  );
  const layouts = await many(
    admin.from("layouts").select("id, name").eq("organization_id", orgId).is("archived_at", null),
    "layouts",
  );
  const groups = await many(
    admin.from("screen_groups").select("id, name").eq("organization_id", orgId),
    "groups",
  );
  const screens = await many(
    admin.from("screens").select("id, name, operational_status, device_id, current_playlist_id").eq("organization_id", orgId).is("archived_at", null),
    "screens",
  );
  const mediaRows = await many(
    admin.from("media").select("id, name, status").eq("organization_id", orgId).is("archived_at", null),
    "media",
  );
  const settings = await one(
    admin.from("organization_settings").select("organization_id, default_image_duration_seconds, default_transition").eq("organization_id", orgId),
    "settings",
  );

  console.log("Existing counts", {
    locations: locations.length,
    screens: screens.length,
    groups: groups.length,
    media: mediaRows.length,
    playlists: playlists.length,
    layouts: layouts.length,
    campaigns: campaigns.length,
    users: users.length,
    settings: Boolean(settings),
  });

  // Locations: add Warehouse demo only if the panel would otherwise be thin.
  let warehouse = locations.find((row) => row.name === NAMES.warehouse);
  if (locations.length < 2 && !warehouse) {
    const inserted = await ensureNamed(
      admin,
      "locations",
      { organization_id: orgId, name: NAMES.warehouse },
      {
        organization_id: orgId,
        name: NAMES.warehouse,
        short_name: "Warehouse",
        code: "WAREHOUSE-DEMO",
        type: "OTHER",
        status: "ACTIVE",
        city: "Doha",
        timezone: "Asia/Qatar",
        created_by: userId,
      },
    );
    warehouse = inserted.row;
    created.push({ page: "Locations", name: NAMES.warehouse, id: warehouse.id });
  } else {
    skipped.push(
      locations.length >= 2
        ? `Locations already has ${locations.length} venues (kept InflataPark; skipped Warehouse demo).`
        : "Warehouse demo already exists.",
    );
  }

  const welcomeFile = findAsset("main_birthday-");
  const poppyFile = findAsset("birthdat-");
  const welcome = await ensureMedia(admin, {
    orgId,
    userId,
    filename: NAMES.welcome,
    filePath: welcomeFile,
    storage,
  });
  const poppy = await ensureMedia(admin, {
    orgId,
    userId,
    filename: NAMES.poppy,
    filePath: poppyFile,
    storage,
  });
  created.push({
    page: "Media",
    name: welcome.name,
    id: welcome.id,
    created: welcome.created,
    storageKey: welcome.storageKey,
  });
  created.push({
    page: "Media",
    name: poppy.name,
    id: poppy.id,
    created: poppy.created,
    storageKey: poppy.storageKey,
  });

  const dummy = await ensureNamed(
    admin,
    "screens",
    { organization_id: orgId, name: NAMES.dummyScreen },
    {
      organization_id: orgId,
      location_id: inflata.id,
      name: NAMES.dummyScreen,
      device_id: null,
      device_name: null,
      screen_type: "Placeholder",
      orientation: "LANDSCAPE",
      width: 1920,
      height: 1080,
      operational_status: "DISABLED",
      last_heartbeat_at: null,
      current_playlist_id: null,
      created_by: userId,
    },
  );
  if (dummy.created) {
    created.push({ page: "Screens", name: NAMES.dummyScreen, id: dummy.row.id });
    const { error: syncError } = await admin.from("device_sync_states").insert({
      screen_id: dummy.row.id,
      sync_state: "WAITING",
      sync_progress: 0,
      package_state: "PENDING",
    });
    throwIf(syncError, "dummy sync state");
  } else {
    skipped.push("Demo Screen (no player) already exists.");
  }

  const groupParty = await ensureNamed(
    admin,
    "screen_groups",
    { organization_id: orgId, name: NAMES.groupParty },
    {
      organization_id: orgId,
      name: NAMES.groupParty,
      description: "Inflata party / private rooms",
      created_by: userId,
    },
  );
  const groupLobby = await ensureNamed(
    admin,
    "screen_groups",
    { organization_id: orgId, name: NAMES.groupLobby },
    {
      organization_id: orgId,
      name: NAMES.groupLobby,
      description: "Front-of-house / lobby screens",
      created_by: userId,
    },
  );
  if (groupParty.created) created.push({ page: "Screen groups", name: NAMES.groupParty, id: groupParty.row.id });
  else skipped.push("Party rooms group already exists.");
  if (groupLobby.created) created.push({ page: "Screen groups", name: NAMES.groupLobby, id: groupLobby.row.id });
  else skipped.push("Lobby TVs group already exists.");

  const groupTargets = await many(
    admin.from("campaign_targets").select("id, campaign_id, type, target_id").eq("type", "SCREEN_GROUP"),
    "group targets",
  );
  const liveGroupCampaigns = groupTargets.filter((row) => row.target_id === groupParty.row.id);
  if (liveGroupCampaigns.length === 0) {
    const { error: memberError } = await admin.from("screen_group_members").upsert(
      { screen_group_id: groupParty.row.id, screen_id: live.id },
      { onConflict: "screen_group_id,screen_id", ignoreDuplicates: true },
    );
    throwIf(memberError, "add live screen to Party rooms");
    created.push({
      page: "Screen groups",
      name: `${NAMES.groupParty} ← ${live.name} (membership only)`,
      id: groupParty.row.id,
    });
  } else {
    notes.push("Did not add live TCL to Party rooms because a campaign already targets that group.");
  }

  const { error: lobbyMemberError } = await admin.from("screen_group_members").upsert(
    { screen_group_id: groupLobby.row.id, screen_id: dummy.row.id },
    { onConflict: "screen_group_id,screen_id", ignoreDuplicates: true },
  );
  throwIf(lobbyMemberError, "add dummy to Lobby TVs");

  const welcomeVersion = await one(
    admin.from("media").select("id, current_version_id").eq("id", welcome.id),
    "welcome version",
  );
  const poppyVersion = await one(
    admin.from("media").select("id, current_version_id").eq("id", poppy.id),
    "poppy version",
  );
  if (!welcomeVersion?.current_version_id || !poppyVersion?.current_version_id) {
    throw new Error("Birthday media is not READY.");
  }

  let playlist = playlists.find((row) => row.name === NAMES.playlist);
  if (!playlist) {
    const { data, error } = await admin
      .from("playlists")
      .insert({
        organization_id: orgId,
        name: NAMES.playlist,
        status: "ACTIVE",
        created_by: userId,
      })
      .select("id, name, status")
      .single();
    throwIf(error, "create playlist");
    playlist = data;
    created.push({ page: "Playlists", name: NAMES.playlist, id: playlist.id });
  } else {
    skipped.push("Poppy Birthday playlist already exists.");
  }

  const items = await many(
    admin.from("playlist_items").select("id").eq("playlist_id", playlist.id),
    "playlist items",
  );
  if (items.length === 0) {
    const { error } = await admin.from("playlist_items").insert([
      {
        id: randomUUID(),
        playlist_id: playlist.id,
        media_id: welcome.id,
        media_version_id: welcomeVersion.current_version_id,
        position: 0,
        duration_seconds: 10,
        transition: "FADE",
        layout_id: null,
        priority: 10,
      },
      {
        id: randomUUID(),
        playlist_id: playlist.id,
        media_id: poppy.id,
        media_version_id: poppyVersion.current_version_id,
        position: 1,
        duration_seconds: 10,
        transition: "FADE",
        layout_id: null,
        priority: 10,
      },
    ]);
    throwIf(error, "playlist items");
  }

  const mainZoneId = randomUUID();
  const tickerZoneId = randomUUID();
  const widthPx = 1920;
  const heightPx = 1080;
  const layoutZones = [
    {
      id: mainZoneId,
      name: "Main",
      type: "IMAGE",
      x_percent: 0,
      y_percent: 0,
      width_percent: 100,
      height_percent: 80,
      content_ref: welcome.id,
      fit: "COVER",
      background: "#19161A",
      duration_seconds: 10,
      sort_order: 0,
    },
    {
      id: tickerZoneId,
      name: "Ticker",
      type: "TEXT",
      x_percent: 0,
      y_percent: 80,
      width_percent: 100,
      height_percent: 20,
      content_ref: "Happy 6th Birthday Poppy",
      fit: "CONTAIN",
      background: "#2A1024",
      duration_seconds: 10,
      sort_order: 1,
    },
  ];
  const deviceJson = {
    widthPx,
    heightPx,
    orientation: "LANDSCAPE",
    background: "#19161A",
    zones: layoutZones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      type: zone.type,
      x: percentToPx(zone.x_percent, widthPx),
      y: percentToPx(zone.y_percent, heightPx),
      width: Math.max(1, percentToPx(zone.width_percent, widthPx)),
      height: Math.max(1, percentToPx(zone.height_percent, heightPx)),
      fit: zone.fit,
      contentRef: zone.content_ref,
      background: zone.background,
      durationSeconds: zone.duration_seconds,
    })),
  };

  let layout = layouts.find((row) => row.name === NAMES.layout);
  if (!layout) {
    const { data, error } = await admin
      .from("layouts")
      .insert({
        organization_id: orgId,
        name: NAMES.layout,
        preset: "VIDEO_BOTTOM_BANNER",
        orientation: "LANDSCAPE",
        width_px: widthPx,
        height_px: heightPx,
        background: "#19161A",
        device_json: deviceJson,
        created_by: userId,
      })
      .select("id, name")
      .single();
    throwIf(error, "create layout");
    layout = data;
    const { error: zoneError } = await admin.from("layout_zones").insert(
      layoutZones.map((zone) => ({ ...zone, layout_id: layout.id })),
    );
    throwIf(zoneError, "layout zones");
    created.push({ page: "Layouts", name: NAMES.layout, id: layout.id });
  } else {
    skipped.push("Party room layout already exists.");
  }

  let campaign = campaigns.find((row) => row.name === NAMES.campaign);
  if (!campaign) {
    const { data, error } = await admin
      .from("campaigns")
      .insert({
        organization_id: orgId,
        name: NAMES.campaign,
        description:
          "Click-through demo for Poppy Birthday. Targeted at Demo Screen (no player) only — not the live TCL.",
        playlist_id: playlist.id,
        layout_id: null,
        status: "SCHEDULED",
        emergency: false,
        created_by: userId,
      })
      .select("id, name, status")
      .single();
    throwIf(error, "create campaign");
    campaign = data;
    const { error: targetError } = await admin.from("campaign_targets").insert({
      campaign_id: campaign.id,
      type: "SCREEN",
      target_id: dummy.row.id,
    });
    throwIf(targetError, "campaign target");
    const { error: scheduleError } = await admin.from("schedules").insert({
      campaign_id: campaign.id,
      start_date: "2026-08-26",
      end_date: "2026-12-31",
      start_time: "00:00",
      end_time: "23:59",
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      timezone: "Asia/Qatar",
      priority: 10,
    });
    throwIf(scheduleError, "campaign schedule");
    created.push({ page: "Campaigns + Schedule", name: NAMES.campaign, id: campaign.id });
  } else {
    skipped.push("Poppy Birthday demo campaign already exists.");
  }

  const liveAfterRow = await one(
    admin
      .from("screens")
      .select(
        "id, name, device_id, operational_status, current_playlist_id, cloud_manifest_version, archived_at, location_id, organization_id",
      )
      .eq("id", live.id),
    "live after",
  );
  const after = await snapshotLive(admin, liveAfterRow);
  const guarded = ["id", "device_id", "operational_status", "current_playlist_id", "cloud_manifest_version", "archived_at"];
  const drift = guarded.filter((key) => before[key] !== after[key]);
  if (drift.length > 0) {
    throw new Error(`Live TCL fields changed: ${drift.join(", ")}`);
  }

  const welcomeUrl = await objectUrl(admin, storage, welcome.storageKey);
  const poppyUrl = await objectUrl(admin, storage, poppy.storageKey);

  const archivedOfficeAfter = await one(
    admin
      .from("screens")
      .select("id, name, device_id, operational_status, archived_at")
      .eq("name", "Inflata - Rajan Office Screen"),
    "archived office after",
  );
  if (
    archivedOffice &&
    (archivedOffice.archived_at !== archivedOfficeAfter?.archived_at ||
      archivedOffice.device_id !== archivedOfficeAfter?.device_id ||
      archivedOffice.operational_status !== archivedOfficeAfter?.operational_status)
  ) {
    throw new Error("Inflata - Rajan Office Screen was modified; aborting.");
  }

  notes.push("Users: skipped adding an extra operator (avoid lockouts). Existing Super Admin left in place.");
  notes.push("Reports: skipped fake proof-of-play / heartbeats.");
  notes.push("Settings: CMS Settings page is browser-local and already defaults to https://e3-cms.vercel.app.");
  notes.push("Did not call publish/notifyScreens. No new content_manifest for the live TCL.");
  notes.push(
    `Live paired screen is "${live.name}" (playlist Rajan Room / campaign Test Rajan Room). Archived "Inflata - Rajan Office Screen" was left archived.`,
  );

  const report = {
    liveTvUnchanged: true,
    storageBackend: storage.backend,
    liveTv: after,
    archivedOfficeScreen: archivedOfficeAfter,
    users: users.map((u) => ({ name: u.name, email: u.email, role: u.role, status: u.status })),
    media: [
      { name: welcome.name, id: welcome.id, cmsPath: "/media", storageKey: welcome.storageKey, signedGetUrl: welcomeUrl },
      { name: poppy.name, id: poppy.id, cmsPath: "/media", storageKey: poppy.storageKey, signedGetUrl: poppyUrl },
    ],
    created,
    skipped,
    notes,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
