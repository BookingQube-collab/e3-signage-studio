# E3 Digital Signage — Admin Panel (UI/UX only)

A complete, responsive admin frontend for the E3 signage CMS, built on the E3 dark/neon design system, running entirely on mock data behind a swappable service layer. No backend, no TV player.

## Design system first

- E3 tokens in `src/styles.css`: `--e3-bg #19161A`, surface `#252229`, elevated `#38343B`, pink `#E95A9D`, purple `#8D5CDD`, deep purple `#5F0BC0`, blue `#5BA2ED`, orange `#E97C53`, text `#F7F7FA` / muted `#A9A7AA`, border `rgba(255,255,255,.10)`, plus the main and accent gradients. Mapped to semantic shadcn tokens so all components theme correctly; dark-first.
- Typography: Rajdhani (500/600/700) for headings, stats, screen and campaign names, pairing codes; Space Grotesk (400/500/600) for body, tables, forms, nav. Loaded via `<link>` in the root route.
- Radius 12–18px, subtle 1px borders, restrained shadows. Gradients used only for primary CTA, active nav, selected screen, sync progress, pairing-code border, and a few highlight cards.
- E3 logo: I'll generate a clean E3 wordmark/monogram asset for the sidebar and login. If you have the real logo file, upload it and I'll swap it in.

## Reusable components

`E3PageHeader, E3Card, E3StatCard, E3Button, E3StatusBadge, E3Progress, E3Modal, E3Table, E3EmptyState, E3Alert, E3MediaCard, E3ScreenCard, E3LocationCard`, plus skeleton/loading, error and empty states used on every page.

## App shell

Collapsible sidebar (logo, 11 nav items), top bar with global search and user menu, mobile drawer navigation. Login sits outside the shell.

## Routes

`/login`, `/dashboard`, `/locations`, `/locations/$id`, `/screens`, `/screens/$id`, `/media`, `/playlists`, `/playlists/new`, `/playlists/$id`, `/layouts`, `/layouts/new`, `/layouts/$id`, `/campaigns`, `/campaigns/new`, `/campaigns/$id`, `/schedule`, `/reports`, `/users`, `/settings`. `/` redirects to `/dashboard`.

## Page highlights

- **Login** — centered logo, "DIGITAL SIGNAGE / CONTENT MANAGEMENT", subtle booth lighting, minimal email/password form, mock sign-in to dashboard.
- **Dashboard** — stat cards (locations, screens, online/offline/syncing, active + scheduled campaigns, storage alerts), per-location online status list, Currently Playing, Recent Activity, Alerts.
- **Locations** — filterable cards/table (All, Permanent FEC, Event, Exhibition, Archived), Add Location modal. Detail page with Overview / Screens / Campaigns / Schedule / Activity tabs and screen cards.
- **Screens** — table + card view with location/status/group/orientation filters and search; Pair Screen flow (pairing code step with gradient border, then name/location/type/orientation/resolution/groups). Detail page: large preview, currently playing, device info panel, and Sync Now / Change Playlist / View Logs / Disable / Unpair actions on mock state. Screen Groups management with create/edit modal.
- **Media** — grid/list library, filters, search, drag-and-drop upload zone with gradient border and mocked progress, media detail with metadata, actions and a "Used In" section.
- **Playlists** — list with items/duration/screens/status; builder with drag-and-drop ordering, per-item duration and transition, duplicate/remove, live preview panel, Save Draft / Preview / Publish.
- **Layouts** — canvas-style builder with presets (Full Screen, 50/50, 70/30, 30/70, video + side/bottom banner, 3 and 4 zones, portrait, custom), drag media into zones, zone inspector (X/Y/W/H, content, fit mode, background, duration), screen properties, Preview and Save Template. Desktop/tablet optimized.
- **Campaigns** — list with status, target, dates, screens, sync status; 6-step stepper (Details, Content, Screens, Schedule, Preview, Publish) with hierarchical location→screen target selection plus groups/all-screens, publish summary, and a sync status view with gradient progress and Waiting/Downloading/Verifying/Ready/Failed/Offline states.
- **Schedule** — calendar and list views, scheduling form (dates, times, days of week, timezone, priority).
- **Reports** — Proof of Play table, Screen Availability, Campaign Performance (operational metrics only).
- **Users** — table, roles (Super Admin, Marketing, Site Supervisor, Event Manager), assigned locations, create/edit modal.
- **Settings** — Organization, Storage, Device, Sync, Content Defaults, Security, Appearance sections (UI only).

## Technical notes

- TypeScript interfaces for Location, Screen, ScreenGroup, Media, Playlist, PlaylistItem, Layout, Zone, Campaign, Schedule, User, SyncStatus.
- Mock data centralized in `src/mocks/` (7 seed locations, 2–4 screens each, realistic statuses) and only reached through `src/services/*` (`locationService`, `screenService`, `mediaService`, `playlistService`, `campaignService`, `scheduleService`, `userService`, `reportService`) with async, promise-based signatures and simulated latency so real APIs drop in later. Components never import mocks directly.
- Data consumed via TanStack Query so loading/error states are real; mutations update in-memory mock state.
- Accessibility: labelled controls, visible focus rings, keyboard-operable drag/drop alternatives, AA contrast on dark surfaces.
- No Lovable Cloud, no backend, portable for export.

## Build order

1. Design tokens, fonts, logo asset, core E3 components
2. App shell + routing + login
3. Types, mocks, services
4. Dashboard, Locations, Screens (+ pairing, groups)
5. Media library and upload
6. Playlists, Layout builder
7. Campaigns flow, Schedule, Sync status
8. Reports, Users, Settings
9. Responsive and empty/error state pass
