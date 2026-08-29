import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  E3Button,
  E3EmptyState,
  E3LocationCard,
  E3PageHeader,
  E3QueryBoundary,
} from "@/components/e3";
import { LocationFormDialog } from "@/features/locations/LocationFormDialog";
import { LocationRowMenu } from "@/features/locations/LocationRowMenu";
import { NO_LOCATION_ACCESS_MESSAGE } from "@/lib/location-scope";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { invalidateKeysInBackground, writeEntityCache } from "@/lib/query-cache";
import { hasQueryClientContext } from "@/lib/router-preload";
import { cn } from "@/lib/utils";
import { locationService } from "@/services";
import type { Location } from "@/types";

export const Route = createFileRoute("/_shell/locations/")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/locations");
  },
  head: () => ({
    meta: [
      { title: "Locations — E3 Digital Signage" },
      {
        name: "description",
        content: "Manage permanent FEC venues, events and exhibitions running E3 screens.",
      },
      { property: "og:title", content: "Locations — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Manage permanent FEC venues, events and exhibitions running E3 screens.",
      },
    ],
  }),
  component: LocationsPage,
});

const FILTERS = ["All", "Permanent FEC", "Event", "Exhibition", "Archived"] as const;

function LocationsPage() {
  const { auth } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canManageLocations = Boolean(auth?.ok && auth.profile.role === "SUPER_ADMIN");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["locations"],
    queryFn: locationService.list,
  });

  const create = useMutation({
    mutationFn: locationService.create,
    onSuccess: (loc) => {
      writeEntityCache(qc, {
        detailKey: ["location", loc.id],
        listKey: ["locations"],
        entity: loc,
      });
      toast.success(`${loc.name} added`);
      setOpen(false);
      void navigate({ to: "/locations/$id", params: { id: loc.id } });
      invalidateKeysInBackground(qc, [["locations"], ["dashboard"]]);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not add location");
    },
  });

  const update = useMutation({
    mutationFn: (input: Parameters<typeof locationService.update>[1]) => {
      if (!editing) throw new Error("Location not found.");
      return locationService.update(editing.id, input);
    },
    onSuccess: (loc) => {
      writeEntityCache(qc, {
        detailKey: ["location", loc.id],
        listKey: ["locations"],
        entity: loc,
      });
      toast.success(`${loc.name} updated`);
      setEditing(null);
      invalidateKeysInBackground(qc, [["locations"], ["location", loc.id]]);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update location");
    },
  });

  const filtered = (data ?? []).filter((l) => {
    if (filter === "All") return l.status !== "Archived";
    if (filter === "Archived") return l.status === "Archived";
    if (filter === "Permanent FEC") return l.type === "Permanent FEC";
    if (filter === "Exhibition") return l.type === "Exhibition";
    return ["Temporary Event", "Outdoor Event", "Pop-up", "Activation"].includes(l.type);
  });

  return (
    <div>
      <E3PageHeader
        title="Locations"
        description="Every venue, event and activation running E3 screens."
        actions={
          canManageLocations ? (
            <E3Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> Add Location
            </E3Button>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === f
                ? "border-transparent e3-gradient text-white"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
        {filtered.length === 0 ? (
          <E3EmptyState
            icon={MapPin}
            title={data && data.length === 0 ? NO_LOCATION_ACCESS_MESSAGE : "No locations here"}
            description={
              data && data.length === 0
                ? "Ask a Super Admin to assign you one or more locations."
                : "Nothing matches this filter yet. Add a location to get started."
            }
            action={
              canManageLocations ? (
                <E3Button variant="primary" onClick={() => setOpen(true)}>
                  <Plus /> Add Location
                </E3Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((l) => (
              <E3LocationCard
                key={l.id}
                location={l}
                overflow={
                  canManageLocations ? (
                    <LocationRowMenu location={l} onEdit={() => setEditing(l)} />
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </E3QueryBoundary>

      <LocationFormDialog
        open={open}
        onOpenChange={setOpen}
        title="Add location"
        description="Locations group the screens installed at one venue or event."
        submitLabel="Add Location"
        pending={create.isPending}
        onSubmit={(form) =>
          create.mutate({
            name: form.name,
            shortName: form.name,
            type: form.type,
            status: form.status,
            city: form.city || "Doha",
            screenCount: 0,
            onlineCount: 0,
            activeCampaigns: 0,
          })
        }
      />

      <LocationFormDialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && update.isPending) return;
          if (!next) setEditing(null);
        }}
        title="Edit location"
        description="Update the venue name, type or status."
        submitLabel="Save changes"
        location={editing}
        pending={update.isPending}
        onSubmit={(form) => {
          if (!editing) return;
          update.mutate({
            name: form.name,
            shortName: editing.shortName === editing.name ? form.name : editing.shortName,
            type: form.type,
            status: form.status,
            city: form.city || "Doha",
            screenCount: editing.screenCount,
            onlineCount: editing.onlineCount,
            activeCampaigns: editing.activeCampaigns,
          });
        }}
      />
    </div>
  );
}
