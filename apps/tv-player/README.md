# E3 TV Player (Phase 15)

Android / Google TV player: pairing, encrypted device token, differential package download, and local `file://` playback.

Heartbeat, queued logs, and proof of play are live. The CMS shows **ONLINE** when a heartbeat arrived in the last **5 minutes**. Deploy, sideload, device support, and the physical test matrix are in [`docs/`](../../docs/android-player.md).

## Requirements

- **JDK 17** to run Gradle 8.11. A newer `java` on PATH (this machine has JDK 25) cannot configure the project: Gradle 8.11 fails, and the IDE gradle-server reports `CONFIGURE FAILED` / `Found 0 tasks`.
- The wrapper (`gradlew.bat`) and `org.gradle.java.home` in `gradle.properties` pin **this repo’s** Temurin 17 at `A:/Live Projects/E3 Signage Studio/.tools/jdk-17`. That path **must be absolute** — Gradle’s `IdentityFileResolver` rejects relative `java.home` / `java.installations.paths` values (`Cannot convert relative path … to an absolute file`).
- If you move the JDK, update `org.gradle.java.home` and/or set `JAVA_HOME` to a JDK 17 install.
- Android SDK 36 (`local.properties` `sdk.dir`, typically `%LOCALAPPDATA%\Android\Sdk`)
- Gradle user home on **NTFS**. This workspace’s `A:` volume is NTFS; `C:` is often nearly full. Prefer:

  ```
  set GRADLE_USER_HOME=A:\Live Projects\E3 Signage Studio\.tools\gradle-home
  ```

  Gradle 8 still cannot use a FAT/exFAT cache (immutable-workspace atomic moves fail).
- CMS reachable from the TV (LAN IP or HTTPS host — not `localhost` on a physical box)

## Configure

Copy `local.properties.example` to `local.properties` and set:

```
sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk
api.base.url=https://e3-cms.vercel.app
```

No Supabase or R2 keys belong in this app. Media is fetched only via signed `downloadUrl` values on the CMS manifest.

Open **`apps/tv-player`** (not the repo root) in Android Studio, or point Cursor’s Gradle JDK at the same JDK 17 home.

## Sync / download / switch (Phase 11)

- Poll `GET /api/devices/:id/sync-status` about every 2 minutes (plus a 15-minute WorkManager backup). Fetch `GET /api/devices/:id/manifest` only on a version bump or `syncRequested`.
- Differential plan: keep files whose Room `MediaAsset` id+version+checksum still match; download only missing or mismatched files into `files/temp/{localFilename}.tmp` with HTTP Range resume, then SHA-256 verify and atomic move to `files/media/{image|video}/`.
- Package states: PENDING → DOWNLOADING → VERIFYING → READY → ACTIVE. FAILED never becomes ACTIVE. The current ACTIVE playlist keeps playing until the new package is fully downloaded and verified.
- After READY, `manifests/vN.json` is already on disk; `manifests/active.json` and the Room ACTIVE row update together. The previous package is kept as READY for rollback.
- Each state change is acked with `POST /api/devices/:id/sync-confirmation`. A disabled screen (manifest 403) does not activate new content.
- Corrupt `.tmp` files are deleted and retried. A mid-download network drop (e.g. 63%) leaves the current playlist running and resumes later.

## Heartbeat / proof of play (Phase 12)

- POST `/api/devices/:id/heartbeat` every **2 minutes** (plus a 15-minute WorkManager backup) with the pairing device token.
- Heartbeats are queued locally when the TV is offline, then flushed on reconnect. Only the latest queued heartbeat is sent.
- CMS **Last seen** is `screens.last_heartbeat_at`. Status is **ONLINE** while that timestamp is within **5 minutes** (`organization_settings.offline_after_seconds`, default 300).
- Completed / skipped / error / interrupted plays are batched to `POST /api/devices/:id/playback-logs` with a stable `batchId` for retries. Uploaded rows are kept locally for 7 days.

## Playback

- Media3 / ExoPlayer for video, BitmapFactory for JPG / PNG / WebP
- Sources are local `file://` paths only — never signed cloud URLs
- Mixed playlists loop, skip failed items, honor image duration; the same clip is rebuilt when the playlist wraps
- Layout zones scale to the physical display (FIT / FILL / COVER / CONTAIN / STRETCH)
- Local schedule windows use the campaign timezone (default Asia/Qatar)
- No admin chrome, titles, or player controls
- Until an ACTIVE package exists, the player shows a branded E3 waiting screen (not a blank black frame)

## Build / sideload

```
gradlew.bat :app:assembleDebug
```

Install `app/build/outputs/apk/debug/app-debug.apk` on the TV, open **E3 Signage**, enter the 6-digit code in the CMS **Pair a screen** dialog.

## Tests

```
gradlew.bat :core:test
```

Fonts: Rajdhani and Space Grotesk (SIL Open Font License).

## Deploy / device matrix (Phase 15)

- [`docs/deployment.md`](../../docs/deployment.md) — env, migrations, storage, Vercel, rollback
- [`docs/android-player.md`](../../docs/android-player.md) — APK/AAB, sideload, minimums, vendor kiosk limits
- [`docs/device-test-matrix.md`](../../docs/device-test-matrix.md) — 12 physical-device cases
