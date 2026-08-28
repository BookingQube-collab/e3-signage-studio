import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { E3Button, E3Card, E3CardBody, E3CardHeader } from "@/components/e3";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { locationService, screenGroupService, screenService } from "@/services";

/** Screens that exist and are assigned to a known location — the only valid campaign targets. */
function isLocationBoundScreen(
  screen: { id: string; locationId: string },
  locationIds: Set<string>,
): boolean {
  return Boolean(screen.locationId) && locationIds.has(screen.locationId);
}

export function TargetSelector({
  selected,
  onChange,
  focusLocationId,
}: {
  selected: string[];
  onChange: (screenIds: string[]) => void;
  focusLocationId?: string;
}) {
  const locations = useQuery({ queryKey: ["locations"], queryFn: locationService.list });
  const screens = useQuery({ queryKey: ["screens"], queryFn: screenService.list });
  const groups = useQuery({ queryKey: ["screen-groups"], queryFn: screenGroupService.list });
  const [expanded, setExpanded] = useState<string[]>(() =>
    focusLocationId ? [focusLocationId] : [],
  );

  useEffect(() => {
    if (!focusLocationId) return;
    setExpanded((current) =>
      current.includes(focusLocationId) ? current : [...current, focusLocationId],
    );
  }, [focusLocationId]);

  const locationIds = useMemo(
    () => new Set((locations.data ?? []).map((loc) => loc.id)),
    [locations.data],
  );

  const eligibleScreens = useMemo(
    () => (screens.data ?? []).filter((s) => isLocationBoundScreen(s, locationIds)),
    [screens.data, locationIds],
  );

  const eligibleIds = useMemo(
    () => new Set(eligibleScreens.map((s) => s.id)),
    [eligibleScreens],
  );

  const locationsWithScreens = useMemo(
    () =>
      (locations.data ?? []).filter((loc) =>
        eligibleScreens.some((s) => s.locationId === loc.id),
      ),
    [locations.data, eligibleScreens],
  );

  const selectableGroups = useMemo(
    () =>
      (groups.data ?? [])
        .map((g) => ({
          ...g,
          screenIds: g.screenIds.filter((id) => eligibleIds.has(id)),
        }))
        .filter((g) => g.screenIds.length > 0),
    [groups.data, eligibleIds],
  );

  // Drop stale / unpaired / location-less IDs so the count stays accurate.
  useEffect(() => {
    if (!screens.isSuccess || !locations.isSuccess) return;
    const next = selected.filter((id) => eligibleIds.has(id));
    if (next.length !== selected.length) onChange(next);
  }, [
    screens.isSuccess,
    locations.isSuccess,
    eligibleIds,
    selected,
    onChange,
  ]);

  const selectedEligible = selected.filter((id) => eligibleIds.has(id));

  const toggleScreen = (id: string) => {
    if (!eligibleIds.has(id)) return;
    onChange(
      selectedEligible.includes(id)
        ? selectedEligible.filter((s) => s !== id)
        : [...selectedEligible, id],
    );
  };

  const toggleLocation = (locationId: string) => {
    const ids = eligibleScreens.filter((s) => s.locationId === locationId).map((s) => s.id);
    if (ids.length === 0) return;
    const allOn = ids.every((id) => selectedEligible.includes(id));
    onChange(
      allOn
        ? selectedEligible.filter((id) => !ids.includes(id))
        : [...new Set([...selectedEligible, ...ids])],
    );
  };

  return (
    <div className="space-y-4">
      <E3Card>
        <E3CardHeader
          title="Target screens"
          description={`${selectedEligible.length} of ${eligibleScreens.length} screens selected`}
          action={
            <div className="flex gap-2">
              <E3Button
                size="sm"
                variant="outline"
                disabled={eligibleScreens.length === 0}
                onClick={() => onChange(eligibleScreens.map((s) => s.id))}
              >
                All screens
              </E3Button>
              <E3Button size="sm" variant="ghost" onClick={() => onChange([])}>
                Clear
              </E3Button>
            </div>
          }
        />
        <E3CardBody className="space-y-2">
          {locationsWithScreens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No screens assigned to a location yet. Pair a screen to a location before targeting a
              campaign.
            </p>
          ) : (
            locationsWithScreens.map((loc) => {
              const locScreens = eligibleScreens.filter((s) => s.locationId === loc.id);
              const selectedCount = locScreens.filter((s) => selectedEligible.includes(s.id)).length;
              const isOpen = expanded.includes(loc.id);
              return (
                <div key={loc.id} className="rounded-xl border border-border">
                  <div className="flex items-center gap-3 p-3">
                    <Checkbox
                      id={`loc-${loc.id}`}
                      checked={selectedCount > 0 && selectedCount === locScreens.length}
                      onCheckedChange={() => toggleLocation(loc.id)}
                      aria-label={`Select all screens at ${loc.name}`}
                    />
                    <label
                      htmlFor={`loc-${loc.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium"
                    >
                      {loc.name}
                    </label>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {selectedCount}/{locScreens.length}
                    </span>
                    <button
                      type="button"
                      aria-label={isOpen ? `Collapse ${loc.name}` : `Expand ${loc.name}`}
                      aria-expanded={isOpen}
                      onClick={() =>
                        setExpanded((e) =>
                          e.includes(loc.id) ? e.filter((x) => x !== loc.id) : [...e, loc.id],
                        )
                      }
                      className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
                    >
                      <ChevronDown
                        className={cn("size-4 transition-transform", isOpen && "rotate-180")}
                      />
                    </button>
                  </div>
                  {isOpen ? (
                    <ul className="space-y-1 border-t border-border p-3">
                      {locScreens.map((s) => (
                        <li key={s.id} className="flex items-center gap-3">
                          <Checkbox
                            id={`scr-${s.id}`}
                            checked={selectedEligible.includes(s.id)}
                            onCheckedChange={() => toggleScreen(s.id)}
                          />
                          <label htmlFor={`scr-${s.id}`} className="min-w-0 flex-1 truncate text-sm">
                            {s.name}
                          </label>
                          <span className="shrink-0 text-xs text-muted-foreground">{s.status}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })
          )}
        </E3CardBody>
      </E3Card>

      <E3Card>
        <E3CardHeader title="Screen groups" description="Add every screen in a group" />
        <E3CardBody className="flex flex-wrap gap-2">
          {selectableGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No screen groups with location-assigned screens.
            </p>
          ) : (
            selectableGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onChange([...new Set([...selectedEligible, ...g.screenIds])])}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {g.name} ({g.screenIds.length})
              </button>
            ))
          )}
        </E3CardBody>
      </E3Card>
    </div>
  );
}
