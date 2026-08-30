# Android / Google TV player

APK/AAB build, sideload, and device support. Do not assume every Android TV model exposes the same kiosk APIs.

## Build output

From `apps/tv-player`, with JDK 17 and an NTFS Gradle home:

```
set JAVA_HOME=A:\Live Projects\E3 Signage Studio\.tools\jdk-17
set GRADLE_USER_HOME=A:\Live Projects\E3 Signage Studio\.tools\gradle-home
gradlew.bat :app:assembleDebug
gradlew.bat :app:bundleRelease
```

| Artifact | Task | Typical path |
|---|---|---|
| Debug APK (sideload) | `:app:assembleDebug` | `dist/e3-signage-player-<versionName>-debug.apk` |
| Release AAB (Play / internal app sharing) | `:app:bundleRelease` | `app/build/outputs/bundle/release/app-release.aab` |

`assembleDebug` (and `assembleRelease`) also copy the APK into the repo `dist/` folder as `e3-signage-player-<versionName>-<buildType>.apk` (currently **0.24.0**). `dist/` is gitignored.

`local.properties` (gitignored; see `local.properties.example`):

```
sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk
api.base.url=https://e3-cms.vercel.app
```

`api.base.url` must be reachable from the TV. Do not use `localhost` or the emulator alias on a physical box. Release signing is not stored in this repo; `bundleRelease` is unsigned unless you configure a keystore locally.

Current player version: **0.24.0** (`versionCode` 24).

Unpaired pairing screen branding is loaded from `GET /api/devices/player-branding` (no device token): org waiting-screen mode/image plus CMS logo. Install this APK (or newer) for admin branding to appear before pair.

Screen orientation is driven by CMS **Edit screen → Orientation** (four Windows-style corners). Sync-status returns `orientation` (`LANDSCAPE` | `PORTRAIT` | `LANDSCAPE_UPSIDE_DOWN` | `PORTRAIT_UPSIDE_DOWN`). The activity stays locked to **landscape** (Android TV panels report landscape metrics even when the glass is mounted vertically). Mount rotation is applied as a full-bleed Compose rotation (**0° / 90° / 180° / 270°**) so waiting UI and playback fill the panel. Portrait mounts + a landscape-labeled resolution (e.g. 1920×1080) are stored/served as a **1080×1920** logical canvas.

## Install

### Android TV / Google TV

1. Enable **Unknown sources** / **Install unknown apps** for the file manager or `adb`.
2. Sideload via USB, a network share, or:

   ```
   adb connect <tv-ip>
   adb install -r dist/e3-signage-player-0.24.0-debug.apk
   ```

3. Open **E3 Signage** from Apps. Enter the 6-digit pairing code in the CMS **Pair a screen** dialog.
4. Within a few seconds the CMS screen detail **Heartbeat** should leave **Never** and the badge should flip to **Online**. If Heartbeat stays **Never**, the TV did not finish activation — use **Repair** with a fresh code from the TV (do not rely on **Sync Now**; that only flags a pull when the player already has a token).
5. After a version bump, uninstall the previous player if Android refuses the upgrade, then sideload. Pairing tokens stay valid until the 7-day rotation window. To pick up a new launcher icon, uninstall the old APK first — Android TV often keeps a cached generic icon across `-r` reinstalls.

### CMS direct download

Super Admins can open **Settings → Player** for **Download APK** / **Copy direct URL**. The same controls appear in **Pair a screen**. Set `PLAYER_APK_URL` (or `VITE_PLAYER_APK_URL`) to a public HTTPS URL (R2/CDN) or a site path such as `/downloads/e3-signage-player.apk` if the file is under `public/downloads/`.

### Android signage box

Same APK. Use the vendor’s file installer or `adb`. Confirm the box can install unknown sources and that the CMS HTTPS host is reachable on that LAN.

## Minimum requirements

| Topic | Requirement |
|---|---|
| OS | `minSdk` 24 (Android 7.0). **Recommended:** Android 10 / Google TV or newer |
| RAM | 1 GB minimum for 1080p stills + short clips. **Recommended:** 2 GB+ |
| Storage | Enough free space for the active package plus the previous READY package. **Recommended:** 8 GB free before large video libraries |
| Codecs | Video: H.264 (AVC) in `video/mp4`. Audio: AAC. Images: JPEG, PNG, WebP. Other containers are rejected at upload |
| 4K | The player will attempt 4K MP4 if the SoC decoder supports it. It is **not** guaranteed on every box |
| Portrait | CMS **Portrait** / **Portrait (upside down)** rotate the UI full-bleed via Compose. Use upside-down if the mount is inverted. Publish a portrait layout (1080×1920) to the screen. |
| Auto-launch | The app is a Leanback + standard launcher. Best-effort `BOOT_COMPLETED` start exists; many vendors ignore it or block activity starts from a receiver |

## Kiosk / vendor limitations

- **Do not claim** that every Android TV, Google TV, or signage box supports identical kiosk controls (lock task, dedicated-device owner, silent install, true HDMI-CEC power-on).
- For unattended power-loss recovery, set **E3 Signage** as the Home / Leanback launcher in the vendor settings when that option exists.
- Some boxes strip `RECEIVE_BOOT_COMPLETED` for sideloaded apps. In that case the user (or a vendor kiosk agent) must open the app once after boot; local playback then starts without waiting for the cloud.
- Keep-screen-on is requested by the activity. Vendor battery / HDMI-CEC policies can still blank the panel.

## Tests

```
gradlew.bat :core:test
```

Physical-device cases are in [`device-test-matrix.md`](device-test-matrix.md).
