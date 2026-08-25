import { Link } from "@tanstack/react-router";
import { MonitorPlay } from "lucide-react";

import { E3Progress } from "@/components/e3/E3Progress";
import { E3StatusBadge } from "@/components/e3/E3StatusBadge";
import { cn } from "@/lib/utils";
import type { Screen } from "@/types";

export function E3ScreenCard({ screen, className }: { screen: Screen; className?: string }) {
  return (
    <Link
      to="/screens/$id"
      params={{ id: screen.id }}
      className={cn(
        "block rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-e3-purple/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h3 className="font-display truncate text-base font-semibold">{screen.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{screen.locationName}</p>
        </div>
        <E3StatusBadge status={screen.status} />
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <MonitorPlay className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Currently playing</dt>
          <dd className="min-w-0 truncate">{screen.nowPlaying ?? "Nothing playing"}</dd>
        </div>
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <dt>Playlist</dt>
          <dd className="min-w-0 truncate text-foreground">{screen.playlistName ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <dt>Last sync</dt>
          <dd className="truncate">{screen.lastSync}</dd>
        </div>
      </dl>

      {screen.syncState === "Downloading" ? (
        <E3Progress className="mt-3" value={screen.syncProgress} label="Downloading" />
      ) : null}
    </Link>
  );
}
