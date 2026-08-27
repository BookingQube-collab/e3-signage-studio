import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { E3Button, E3Card, E3CardBody, E3CardHeader, E3PageHeader, E3Progress, E3QueryBoundary } from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TargetSelector } from "@/features/campaigns/TargetSelector";
import { cn } from "@/lib/utils";
import { addDaysIso, localIsoDate } from "@/lib/schedule-days";
import { campaignService, layoutService, locationService, playlistService, screenService } from "@/services";
import type { Campaign } from "@/types";

export const Route = createFileRoute("/_shell/campaigns/new")({
  validateSearch: (search: Record<string, unknown>): { edit?: string; duplicate?: string } => ({
    edit: typeof search.edit === "string" && search.edit.length > 0 ? search.edit : undefined,
    duplicate: typeof search.duplicate === "string" && search.duplicate.length > 0 ? search.duplicate : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New campaign — E3 Digital Signage" },
      { name: "description", content: "Create, target, schedule and publish a content campaign." },
      { property: "og:title", content: "New campaign — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Create, target, schedule and publish a content campaign.",
      },
    ],
  }),
  component: NewCampaignPage,
});

const STEPS = [
  "Campaign Details",
  "Select Content",
  "Select Screens",
  "Schedule",
  "Preview",
  "Publish",
] as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function blankCampaign(): Campaign {
  return {
    id: `cmp-${Date.now()}`,
    name: "",
    description: "",
    status: "Draft",
    contentType: "Playlist",
    contentId: "",
    contentName: "—",
    locationIds: [],
    screenIds: [],
    schedule: {
      startDate: localIsoDate(),
      endDate: addDaysIso(localIsoDate(), 16),
      startTime: "12:00",
      endTime: "22:00",
      days: [...DAYS],
      timezone: "Asia/Qatar",
      priority: 1,
    },
    syncReady: 0,
    syncTotal: 0,
    modifiedAt: new Date().toISOString().slice(0, 10),
  };
}

function NewCampaignPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { edit, duplicate } = Route.useSearch();
  const sourceId = edit ?? duplicate;
  const mode = edit ? "edit" : duplicate ? "duplicate" : "create";
  const [step, setStep] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [draft, setDraft] = useState<Campaign>(blankCampaign);

  const source = useQuery({
    queryKey: ["campaign", sourceId],
    queryFn: () => campaignService.get(sourceId!),
    enabled: Boolean(sourceId),
  });

  useEffect(() => {
    if (!source.data) return;
    if (mode === "edit") {
      setDraft(source.data);
      return;
    }
    if (mode === "duplicate") {
      setDraft({
        ...source.data,
        id: `cmp-${Date.now()}`,
        name: source.data.name.startsWith("Copy of ") ? source.data.name : `Copy of ${source.data.name}`,
        status: "Draft",
        syncReady: 0,
      });
    }
  }, [source.data, mode]);

  const liveEdit = mode === "edit" && (draft.status === "Active" || draft.status === "Scheduled");
  const title = mode === "edit" ? "Edit campaign" : mode === "duplicate" ? "Duplicate campaign" : "New campaign";
  const description =
    mode === "edit"
      ? "Change name, schedule, screens or playlist, then save to republish the package."
      : mode === "duplicate"
        ? "A new draft copied from an existing campaign."
        : "Six steps from content to published screens.";

  const playlists = useQuery({ queryKey: ["playlists"], queryFn: playlistService.list });
  const layouts = useQuery({ queryKey: ["layouts"], queryFn: layoutService.list });
  const locations = useQuery({ queryKey: ["locations"], queryFn: locationService.list });
  const screens = useQuery({ queryKey: ["screens"], queryFn: screenService.list });

  const save = useMutation({
    mutationFn: campaignService.save,
    onSuccess: (c) => {
      toast.success("Draft saved");
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void navigate({ to: "/campaigns/$id", params: { id: c.id } });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not save draft.");
    },
  });

  const publishMut = useMutation({
    mutationFn: campaignService.publish,
    onMutate: () => {
      setPublishing(true);
      setProgress(35);
    },
    onSuccess: (c) => {
      setProgress(100);
      toast.success(liveEdit ? "Campaign updated" : "Campaign published");
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["campaign", c.id] });
      void qc.invalidateQueries({ queryKey: ["campaign-sync", c.id] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void navigate({ to: "/campaigns/$id", params: { id: c.id } });
    },
    onError: (err) => {
      setPublishing(false);
      setProgress(0);
      toast.error(err instanceof Error ? err.message : "Publish failed.");
    },
  });

  const targetLocations = (locations.data ?? []).filter((l) =>
    (screens.data ?? []).some((s) => draft.screenIds.includes(s.id) && s.locationId === l.id),
  );

  const contentOptions =
    draft.contentType === "Playlist"
      ? (playlists.data ?? []).map((p) => ({ id: p.id, name: p.name }))
      : (layouts.data ?? []).map((l) => ({ id: l.id, name: l.name }));

  const canContinue =
    (step === 0 && draft.name.trim().length > 0) ||
    (step === 1 && draft.contentId !== "") ||
    (step === 2 && draft.screenIds.length > 0) ||
    step === 3 ||
    step === 4;

  function publish() {
    publishMut.mutate({
      ...draft,
      locationIds: targetLocations.map((l) => l.id),
      syncTotal: draft.screenIds.length,
      syncReady: 0,
    });
  }

  return (
    <E3QueryBoundary
      isLoading={Boolean(sourceId) && source.isLoading}
      isError={Boolean(sourceId) && source.isError}
      refetch={() => void source.refetch()}
    >
    <div>
      <E3PageHeader
        title={title}
        description={description}
      />

      <ol className="mb-6 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => i <= step && setStep(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors",
                i === step
                  ? "e3-gradient border-transparent text-white"
                  : i < step
                    ? "border-border bg-card text-foreground"
                    : "border-border text-muted-foreground",
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-black/25 text-[10px] font-semibold">
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="min-w-0 truncate">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <E3Card>
        <E3CardHeader title={STEPS[step] ?? ""} />
        <E3CardBody className="space-y-5">
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="c-name">Campaign name</Label>
                <Input
                  id="c-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Back To School 2026"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="c-desc">Description</Label>
                <Textarea
                  id="c-desc"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="What is this campaign promoting?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-priority">Priority</Label>
                <Input
                  id="c-priority"
                  type="number"
                  min={1}
                  max={10}
                  value={draft.schedule.priority}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      schedule: { ...draft.schedule, priority: Number(e.target.value) || 1 },
                    })
                  }
                />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                {(["Playlist", "Layout"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={draft.contentType === t}
                    onClick={() =>
                      setDraft({ ...draft, contentType: t, contentId: "", contentName: "—" })
                    }
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm",
                      draft.contentType === t
                        ? "e3-gradient border-transparent text-white"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {contentOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, contentId: o.id, contentName: o.name })}
                    className={cn(
                      "rounded-xl border p-4 text-left text-sm transition-colors",
                      draft.contentId === o.id
                        ? "e3-gradient-border border-0 bg-card"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <span className="block truncate font-medium">{o.name}</span>
                    <span className="text-xs text-muted-foreground">{draft.contentType}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <TargetSelector
              selected={draft.screenIds}
              onChange={(screenIds) => setDraft({ ...draft, screenIds })}
            />
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-start">Start date</Label>
                <Input
                  id="s-start"
                  type="date"
                  value={draft.schedule.startDate}
                  onChange={(e) =>
                    setDraft({ ...draft, schedule: { ...draft.schedule, startDate: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-end">End date</Label>
                <Input
                  id="s-end"
                  type="date"
                  value={draft.schedule.endDate}
                  onChange={(e) =>
                    setDraft({ ...draft, schedule: { ...draft.schedule, endDate: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-stime">Start time</Label>
                <Input
                  id="s-stime"
                  type="time"
                  value={draft.schedule.startTime}
                  onChange={(e) =>
                    setDraft({ ...draft, schedule: { ...draft.schedule, startTime: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-etime">End time</Label>
                <Input
                  id="s-etime"
                  type="time"
                  value={draft.schedule.endTime}
                  onChange={(e) =>
                    setDraft({ ...draft, schedule: { ...draft.schedule, endTime: e.target.value } })
                  }
                />
              </div>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-sm font-medium">Days of week</legend>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const on = draft.schedule.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            schedule: {
                              ...draft.schedule,
                              days: on
                                ? draft.schedule.days.filter((x) => x !== d)
                                : [...draft.schedule.days, d],
                            },
                          })
                        }
                        className={cn(
                          "w-14 rounded-xl border py-2 text-xs",
                          on
                            ? "e3-gradient border-transparent text-white"
                            : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="s-tz">Time zone</Label>
                <Select
                  value={draft.schedule.timezone}
                  onValueChange={(v) =>
                    setDraft({ ...draft, schedule: { ...draft.schedule, timezone: v } })
                  }
                >
                  <SelectTrigger id="s-tz">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Asia/Qatar", "Asia/Dubai", "Europe/London", "UTC"].map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {step >= 4 ? (
            <div className="space-y-5">
              <div className="e3-gradient-border rounded-2xl bg-background p-6">
                <h3 className="font-display text-xl font-bold uppercase tracking-wide">
                  {draft.name || "Untitled campaign"}
                </h3>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Content</dt>
                    <dd className="mt-1 text-sm font-medium">{draft.contentName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Target</dt>
                    <dd className="mt-1 text-sm font-medium">{draft.screenIds.length} screens</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Locations
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {targetLocations.map((l) => l.shortName).join(", ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Schedule
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {draft.schedule.startDate} → {draft.schedule.endDate} ·{" "}
                      {draft.schedule.startTime}–{draft.schedule.endTime}
                    </dd>
                  </div>
                </dl>
              </div>

              {publishing ? (
                <E3Progress value={progress} label="Publishing to target screens" />
              ) : null}
            </div>
          ) : null}
        </E3CardBody>
      </E3Card>

      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <E3Button
          variant="outline"
          disabled={save.isPending || publishMut.isPending || publishing}
          onClick={() => (step === 0 ? void navigate({ to: "/campaigns" }) : setStep(step - 1))}
        >
          {step === 0 ? "Cancel" : "Back"}
        </E3Button>
        <div className="flex gap-2">
          {liveEdit ? null : (
            <E3Button
              variant="ghost"
              loading={save.isPending}
              disabled={publishMut.isPending || publishing}
              onClick={() => save.mutate(draft)}
            >
              Save draft
            </E3Button>
          )}
          {step < STEPS.length - 1 ? (
            <E3Button
              variant="primary"
              disabled={!canContinue}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </E3Button>
          ) : (
            <E3Button
              variant="primary"
              size="lg"
              loading={publishing || publishMut.isPending}
              disabled={save.isPending}
              onClick={publish}
            >
              {mode === "edit" ? "Save changes" : "PUBLISH CAMPAIGN"}
            </E3Button>
          )}
        </div>
      </div>
    </div>
    </E3QueryBoundary>
  );
}
