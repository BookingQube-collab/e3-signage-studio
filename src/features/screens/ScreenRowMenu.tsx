import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Pencil, Trash2, Wrench } from "lucide-react";
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
import { EditScreenDialog } from "@/features/screens/EditScreenDialog";
import { RepairScreenDialog } from "@/features/screens/RepairScreenDialog";
import { invalidateKeysInBackground, removeById } from "@/lib/query-cache";
import { screenService } from "@/services";
import type { Screen } from "@/types";

export function ScreenRowMenu({ screen }: { screen: Screen }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const unpair = useMutation({
    mutationFn: () => screenService.unpair(screen.id),
    onSuccess: () => {
      setConfirmDelete(false);
      qc.setQueryData(["screens"], (prev: Screen[] | undefined) =>
        removeById(Array.isArray(prev) ? prev : [], screen.id),
      );
      qc.removeQueries({ queryKey: ["screen", screen.id] });
      toast.success(`${screen.name} deleted`);
      invalidateKeysInBackground(qc, [["locations"], ["dashboard"]]);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not unpair screen.");
    },
  });

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
            aria-label={`Actions for ${screen.name}`}
            disabled={unpair.isPending}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {unpair.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRepairOpen(true)}>
            <Wrench />
            Repair
          </DropdownMenuItem>
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

      <EditScreenDialog open={editOpen} onOpenChange={setEditOpen} screen={screen} />
      <RepairScreenDialog
        open={repairOpen}
        onOpenChange={setRepairOpen}
        screenId={screen.id}
        screenName={screen.name}
      />
      <E3Modal
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && unpair.isPending) return;
          setConfirmDelete(open);
        }}
        title={`Delete ${screen.name}?`}
        description="This unpairs the device. It will stop receiving content until it is paired again."
        footer={
          <>
            <E3Button variant="outline" disabled={unpair.isPending} onClick={() => setConfirmDelete(false)}>
              Cancel
            </E3Button>
            <E3Button
              variant="danger"
              loading={unpair.isPending}
              onClick={() => unpair.mutate()}
            >
              Delete screen
            </E3Button>
          </>
        }
      />
    </div>
  );
}
