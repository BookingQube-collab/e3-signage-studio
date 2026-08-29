import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { E3Button, E3Modal } from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { screenGroupService, screenService } from "@/services";
import { invalidateKeysInBackground, writeEntityCache } from "@/lib/query-cache";
import type { Orientation, Screen } from "@/types";

const SCREEN_TYPES = ["Smart TV", "LED Wall", "Kiosk", "Projector", "Tablet"] as const;
const RESOLUTIONS = ["1920 × 1080", "3840 × 2160", "1080 × 1920"] as const;

function formFromScreen(screen: Screen) {
  return {
    name: screen.name,
    screenType: screen.screenType,
    orientation: screen.orientation,
    resolution: screen.resolution,
    groupIds: [...screen.groupIds],
  };
}

export function EditScreenDialog({
  open,
  onOpenChange,
  screen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screen: Screen;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => formFromScreen(screen));
  const groups = useQuery({ queryKey: ["screen-groups"], queryFn: screenGroupService.list });

  useEffect(() => {
    if (open) setForm(formFromScreen(screen));
  }, [open, screen]);

  const screenTypes = useMemo(() => {
    if (SCREEN_TYPES.includes(form.screenType as (typeof SCREEN_TYPES)[number])) {
      return [...SCREEN_TYPES];
    }
    return [form.screenType, ...SCREEN_TYPES];
  }, [form.screenType]);

  const resolutions = useMemo(() => {
    if (RESOLUTIONS.includes(form.resolution as (typeof RESOLUTIONS)[number])) {
      return [...RESOLUTIONS];
    }
    return [form.resolution, ...RESOLUTIONS];
  }, [form.resolution]);

  const save = useMutation({
    mutationFn: () =>
      screenService.update(screen.id, {
        name: form.name.trim(),
        screenType: form.screenType,
        orientation: form.orientation,
        resolution: form.resolution,
        groupIds: form.groupIds,
      }),
    onSuccess: (next) => {
      writeEntityCache(qc, {
        detailKey: ["screen", screen.id],
        listKey: ["screens"],
        entity: next,
      });
      toast.success(`${next.name} updated`);
      onOpenChange(false);
      invalidateKeysInBackground(qc, [
        ["screen-groups"],
        ["location", screen.locationId],
        ["locations"],
        ["dashboard"],
      ]);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update screen");
    },
  });

  const nameValid = form.name.trim().length > 0;

  return (
    <E3Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && save.isPending) return;
        onOpenChange(next);
      }}
      title="Edit screen"
      description="Update the name, type, orientation, resolution, and groups for this player."
      footer={
        <>
          <E3Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </E3Button>
          <E3Button
            variant="primary"
            disabled={!nameValid}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save changes
          </E3Button>
        </>
      }
    >
      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2">
          <Label htmlFor="edit-scr-name">Screen name</Label>
          <Input
            id="edit-scr-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Reception TV"
            disabled={save.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-scr-loc">Location</Label>
          <Input id="edit-scr-loc" value={screen.locationName} disabled readOnly />
          <p className="text-xs text-muted-foreground">
            Location is set when the screen is paired. Unpair and pair again to move it.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-scr-type">Screen type</Label>
            <Select
              value={form.screenType}
              onValueChange={(v) => setForm({ ...form, screenType: v })}
              disabled={save.isPending}
            >
              <SelectTrigger id="edit-scr-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {screenTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-scr-orient">Orientation</Label>
            <Select
              value={form.orientation}
              onValueChange={(v) => setForm({ ...form, orientation: v as Orientation })}
              disabled={save.isPending}
            >
              <SelectTrigger id="edit-scr-orient">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Landscape">Landscape</SelectItem>
                <SelectItem value="Portrait">Portrait</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-scr-res">Resolution</Label>
          <Select
            value={form.resolution}
            onValueChange={(v) => setForm({ ...form, resolution: v })}
            disabled={save.isPending}
          >
            <SelectTrigger id="edit-scr-res">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resolutions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Screen groups</legend>
          {(groups.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No screen groups yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(groups.data ?? []).map((g) => {
                const active = form.groupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={active}
                    disabled={save.isPending}
                    onClick={() =>
                      setForm({
                        ...form,
                        groupIds: active
                          ? form.groupIds.filter((x) => x !== g.id)
                          : [...form.groupIds, g.id],
                      })
                    }
                    className={
                      active
                        ? "e3-gradient rounded-full px-3 py-1.5 text-xs text-white"
                        : "rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                    }
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      </div>
    </E3Modal>
  );
}
