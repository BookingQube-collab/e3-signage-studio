import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { E3Button, E3Card, E3CardBody, E3CardHeader } from "@/components/e3";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { locationService, screenGroupService, screenService } from "@/services";

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

  const allScreens = screens.data ?? [];

  const toggleScreen = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const toggleLocation = (locationId: string) => {
    const ids = allScreens.filter((s) => s.locationId === locationId).map((s) => s.id);
    const allOn = ids.every((id) => selected.includes(id));
    onChange(
      allOn ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])],
    );
  };

  return (
    <div className="space-y-4">
      <E3Card>
        <E3CardHeader
          title="Target screens"
          description={`${selected.length} of ${allScreens.length} screens selected`}
          action={
            <div className="flex gap-2">
              <E3Button
                size="sm"
                variant="outline"
                onClick={() => onChange(allScreens.map((s) => s.id))}
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
          {(locations.data ?? []).map((loc) => {
            const locScreens = allScreens.filter((s) => s.locationId === loc.id);
            const selectedCount = locScreens.filter((s) => selected.includes(s.id)).length;
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
                          checked={selected.includes(s.id)}
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
          })}
        </E3CardBody>
      </E3Card>

      <E3Card>
        <E3CardHeader title="Screen groups" description="Add every screen in a group" />
        <E3CardBody className="flex flex-wrap gap-2">
          {(groups.data ?? []).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onChange([...new Set([...selected, ...g.screenIds])])}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {g.name} ({g.screenIds.length})
            </button>
          ))}
        </E3CardBody>
      </E3Card>
    </div>
  );
}
