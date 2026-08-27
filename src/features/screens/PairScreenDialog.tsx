import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { DEFAULT_PUBLIC_CMS_URL, getPublicCmsUrl } from "@/lib/cms-settings";
import { locationService, screenGroupService, screenService } from "@/services";
import type { Orientation } from "@/types";

export function PairScreenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [form, setForm] = useState({
    name: "",
    locationId: "",
    screenType: "Smart TV",
    orientation: "Landscape" as Orientation,
    resolution: "1920 × 1080",
    groupIds: [] as string[],
  });
  const [publicCmsUrl, setPublicCmsUrl] = useState(DEFAULT_PUBLIC_CMS_URL);

  useEffect(() => {
    setPublicCmsUrl(getPublicCmsUrl());
  }, []);

  const locations = useQuery({ queryKey: ["locations"], queryFn: locationService.list });
  const groups = useQuery({ queryKey: ["screen-groups"], queryFn: screenGroupService.list });

  const pair = useMutation({
    mutationFn: screenService.pair,
    onSuccess: (screen) => {
      void qc.invalidateQueries({ queryKey: ["screens"] });
      void qc.invalidateQueries({ queryKey: ["locations"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${screen.name} paired`);
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not pair screen");
    },
  });

  function reset() {
    setStep(1);
    setCode("");
    setForm({
      name: "",
      locationId: "",
      screenType: "Smart TV",
      orientation: "Landscape",
      resolution: "1920 × 1080",
      groupIds: [],
    });
  }

  const codeDigits = code.replace(/\D/g, "").slice(0, 6);
  const codeValid = codeDigits.length === 6;

  return (
    <E3Modal
      open={open}
      onOpenChange={(o) => {
        if (!o && pair.isPending) return;
        if (!o) reset();
        onOpenChange(o);
      }}
      title={step === 1 ? "Pair a screen" : "Configure screen"}
      description={
        step === 1
          ? "Enter the 6-digit code shown on the player device."
          : "Give the screen a name and attach it to a location."
      }
      footer={
        step === 1 ? (
          <>
            <E3Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </E3Button>
            <E3Button variant="primary" disabled={!codeValid} onClick={() => setStep(2)}>
              Continue
            </E3Button>
          </>
        ) : (
          <>
            <E3Button variant="outline" disabled={pair.isPending} onClick={() => setStep(1)}>
              Back
            </E3Button>
            <E3Button
              variant="primary"
              disabled={!form.name || !form.locationId}
              loading={pair.isPending}
              onClick={() => pair.mutate({ code: codeDigits, ...form })}
            >
              PAIR SCREEN
            </E3Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="space-y-5">
          <div className="e3-gradient-border rounded-2xl bg-background p-6 text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Pairing code</p>
            <p className="font-display mt-2 text-4xl font-bold tabular-nums tracking-[0.3em]">
              {(codeDigits.padEnd(6, "•").match(/.{1,3}/g) ?? []).join(" ")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pair-code">Enter code</Label>
            <Input
              id="pair-code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="583 294"
              className="h-12 text-center text-lg tracking-[0.3em]"
            />
            <p className="text-xs text-muted-foreground">
              Install the E3 player pointed at {publicCmsUrl}, then enter the 6-digit code
              shown on the TV.
            </p>
          </div>
        </div>
      ) : (
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="scr-name">Screen name</Label>
            <Input
              id="scr-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Reception TV"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scr-loc">Location</Label>
            <Select
              value={form.locationId}
              onValueChange={(v) => setForm({ ...form, locationId: v })}
            >
              <SelectTrigger id="scr-loc">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {(locations.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="scr-type">Screen type</Label>
              <Select
                value={form.screenType}
                onValueChange={(v) => setForm({ ...form, screenType: v })}
              >
                <SelectTrigger id="scr-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Smart TV", "LED Wall", "Kiosk", "Projector", "Tablet"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scr-orient">Orientation</Label>
              <Select
                value={form.orientation}
                onValueChange={(v) => setForm({ ...form, orientation: v as Orientation })}
              >
                <SelectTrigger id="scr-orient">
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
            <Label htmlFor="scr-res">Resolution</Label>
            <Select
              value={form.resolution}
              onValueChange={(v) => setForm({ ...form, resolution: v })}
            >
              <SelectTrigger id="scr-res">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1920 × 1080">1920 × 1080</SelectItem>
                <SelectItem value="3840 × 2160">3840 × 2160</SelectItem>
                <SelectItem value="1080 × 1920">1080 × 1920 (portrait)</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Screen groups</legend>
            <div className="flex flex-wrap gap-2">
              {(groups.data ?? []).slice(0, 8).map((g) => {
                const active = form.groupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={active}
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
          </fieldset>
        </div>
      )}
    </E3Modal>
  );
}
