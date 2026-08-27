import { useEffect, useState } from "react";

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
import type { Location, LocationStatus, LocationType } from "@/types";

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

export type LocationFormValues = {
  name: string;
  city: string;
  type: LocationType;
  status: LocationStatus;
};

const BLANK: LocationFormValues = {
  name: "",
  city: "",
  type: "Permanent FEC",
  status: "Active",
};

function valuesFromLocation(location: Location | null | undefined): LocationFormValues {
  if (!location) return BLANK;
  return {
    name: location.name,
    city: location.city,
    type: location.type,
    status: location.status,
  };
}

export function LocationFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  location,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  location?: Location | null;
  pending: boolean;
  onSubmit: (values: LocationFormValues) => void;
}) {
  const [form, setForm] = useState<LocationFormValues>(valuesFromLocation(location));

  useEffect(() => {
    if (open) setForm(valuesFromLocation(location));
  }, [open, location]);

  return (
    <E3Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
      title={title}
      description={description}
      footer={
        <>
          <E3Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </E3Button>
          <E3Button
            variant="primary"
            disabled={!form.name.trim()}
            loading={pending}
            onClick={() => onSubmit(form)}
          >
            {submitLabel}
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
  );
}
