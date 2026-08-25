import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  E3Button,
  E3EmptyState,
  E3LocationCard,
  E3Modal,
  E3PageHeader,
  E3QueryBoundary,
} from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { locationService } from "@/services";
import type { LocationStatus, LocationType } from "@/types";

export const Route = createFileRoute("/_shell/locations/")({
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

const LOCATION_TYPES: LocationType[] = [
  "Permanent FEC",
  "Temporary Event",
  "Exhibition",
  "Pop-up",
  "Outdoor Event",
  "Activation",
  "Other",
];

const LOCATION_STATUSES: LocationStatus[] = ["Active", "Upcoming", "Inactive", "Archived"];

function LocationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    city: "",
    type: "Permanent FEC" as LocationType,
    status: "Active" as LocationStatus,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["locations"],
    queryFn: locationService.list,
  });

  const create = useMutation({
    mutationFn: locationService.create,
    onSuccess: (loc) => {
      void qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success(`${loc.name} added`);
      setOpen(false);
      setForm({ name: "", city: "", type: "Permanent FEC", status: "Active" });
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
          <E3Button variant="primary" onClick={() => setOpen(true)}>
            <Plus /> Add Location
          </E3Button>
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
            title="No locations here"
            description="Nothing matches this filter yet. Add a location to get started."
            action={
              <E3Button variant="primary" onClick={() => setOpen(true)}>
                <Plus /> Add Location
              </E3Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((l) => (
              <E3LocationCard key={l.id} location={l} />
            ))}
          </div>
        )}
      </E3QueryBoundary>

      <E3Modal
        open={open}
        onOpenChange={setOpen}
        title="Add location"
        description="Locations group the screens installed at one venue or event."
        footer={
          <>
            <E3Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </E3Button>
            <E3Button
              variant="primary"
              disabled={!form.name || create.isPending}
              onClick={() =>
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
            >
              {create.isPending ? "Saving…" : "Add Location"}
            </E3Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loc-name">Location name</Label>
            <Input
              id="loc-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Urban Arena Msheireb"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loc-city">City / venue</Label>
            <Input
              id="loc-city"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Doha"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="loc-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as LocationType })}
              >
                <SelectTrigger id="loc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as LocationStatus })}
              >
                <SelectTrigger id="loc-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </E3Modal>
    </div>
  );
}
