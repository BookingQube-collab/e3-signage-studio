import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Megaphone, Monitor } from "lucide-react";

import { E3StatusBadge } from "@/components/e3/E3StatusBadge";
import type { Location } from "@/types";

export function E3LocationCard({
  location,
  overflow,
}: {
  location: Location;
  overflow?: ReactNode;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-e3-purple/40">
      <Link
        to="/locations/$id"
        params={{ id: location.id }}
        className="block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h3 className="font-display truncate text-lg font-semibold">{location.name}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {location.type} · {location.city}
            </p>
          </div>
          <E3StatusBadge status={location.status} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Screens</p>
            <p className="font-display text-xl font-semibold tabular-nums">{location.screenCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Online</p>
            <p className="font-display text-xl font-semibold tabular-nums text-success">
              {location.onlineCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Campaigns</p>
            <p className="font-display text-xl font-semibold tabular-nums">
              {location.activeCampaigns}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Monitor className="size-3.5" aria-hidden />
            {location.onlineCount}/{location.screenCount} online
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Megaphone className="size-3.5" aria-hidden />
            {location.activeCampaigns} active
          </span>
        </div>
      </Link>
      {overflow ? <div className="absolute right-3 top-14 z-10">{overflow}</div> : null}
    </div>
  );
}
