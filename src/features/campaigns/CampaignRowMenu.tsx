import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Copy, MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { E3Button, E3Modal } from "@/components/e3";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { campaignService } from "@/services";
import type { Campaign } from "@/types";

export function CampaignRowMenu({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stop = useMutation({
    mutationFn: () => campaignService.save({ ...campaign, status: "Paused" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      void qc.invalidateQueries({ queryKey: ["campaign-sync", campaign.id] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Campaign stopped — it is no longer published to screens.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not stop campaign.");
    },
  });

  const resume = useMutation({
    mutationFn: () => campaignService.publish({ ...campaign, status: "Active" }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      void qc.invalidateQueries({ queryKey: ["campaign-sync", campaign.id] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(c.status === "Paused" ? "Campaign paused" : "Campaign resumed");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not resume campaign.");
    },
  });

  const remove = useMutation({
    mutationFn: () => campaignService.remove(campaign.id),
    onSuccess: () => {
      setConfirmDelete(false);
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Campaign deleted. Screens stay paired.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not delete campaign.");
    },
  });

  const busy = stop.isPending || resume.isPending || remove.isPending;
  const canStop = campaign.status === "Active" || campaign.status === "Scheduled";
  const canResume = campaign.status === "Paused";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${campaign.name}`}
            disabled={busy}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() => void navigate({ to: "/campaigns/new", search: { edit: campaign.id } })}
          >
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void navigate({ to: "/campaigns/new", search: { duplicate: campaign.id } })
            }
          >
            <Copy />
            Duplicate
          </DropdownMenuItem>
          {canStop ? (
            <DropdownMenuItem disabled={busy} onSelect={() => stop.mutate()}>
              <Pause />
              Stop
            </DropdownMenuItem>
          ) : null}
          {canResume ? (
            <DropdownMenuItem disabled={busy} onSelect={() => resume.mutate()}>
              <Play />
              Resume
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmDelete(true)}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <E3Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${campaign.name}?`}
        description="This removes the campaign from the CMS. Screens stay paired. If this campaign was on a screen, it will be taken off."
        footer={
          <>
            <E3Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </E3Button>
            <E3Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete campaign
            </E3Button>
          </>
        }
      />
    </div>
  );
}
