# Physical-device test matrix

Automated coverage lives in `npm test` (CMS) and `gradlew.bat :core:test` (player). The cases below must still be run on at least one physical Android TV or Google TV before calling a hardware vendor “supported”.

Record OS version, RAM, free storage, and whether kiosk/Home-launcher settings were used. Results are per device — one passing box does not imply another vendor behaves the same.

| ID | Setup | Expected | Automated stand-in |
|---|---|---|---|
| TC1 | Internet connected. Nothing changed | Local playback continues. No media downloads. No full manifest fetch | `shouldFetchManifest` (CMS + player) |
| TC2 | One image changed | Only that image downloads | `planDownloads` mismatch fetch |
| TC3 | ~500 MB video playlist; one 2 MB image changed | Only the image bytes are needed; the video is skipped | `DownloadPlanTest.changedImageDoesNotRedownloadUnchanged500mbVideo` |
| TC4 | Disconnect network during a new-version sync | Current ACTIVE playlist keeps playing. The new version does not become ACTIVE | `PackageMachineTest` FAILED/DOWNLOADING never ACTIVE |
| TC5 | Restore network after TC4 | Resume missing assets, checksum-verify, activate only when complete | Package switch after READY |
| TC6 | Boot / start with no internet and a known-good package | Local playlist starts immediately; cloud sync is later | Playback startup order + TC12 keep-set |
| TC7 | Schedule already on disk; internet down when the window opens | Campaign activates from the local clock | `ScheduleEngineTest` |
| TC8 | Video + image layout | Both zones play from `file://` | `ZonePlanTest` |
| TC9 | Corrupt downloaded file | SHA-256 fails; corrupt file never becomes ACTIVE | `ChecksumAndFinalizeTest` |
| TC10 | Many screens get the same campaign; one is offline | Each screen syncs independently. Admin shows per-screen progress. Offline does not block others | `target-resolve` + sync state machine |
| TC11 | Force-stop / crash the TV app | App recovers and loads the local known-good playlist | ACTIVE package retained on disk |
| TC12 | Storage nearly full | Unused cache/temp/old media removed. ACTIVE (+ previous READY) assets remain | `StoragePruneTest` |
| Power | Pull power, wait, restore | Android boots → app launches if launcher/BOOT_COMPLETED allows → local playlist starts → then cloud sync | Documented in [`android-player.md`](android-player.md); vendor-dependent |

## Suggested lab devices

Test at least one of each class you actually ship:

- Android TV stick / box (sideload)
- Google TV (Play-capable) if you later use internal app sharing
- The specific signage-box SKU for a venue

If a vendor blocks auto-launch or unknown sources, note it on that row rather than treating it as a player regression.
