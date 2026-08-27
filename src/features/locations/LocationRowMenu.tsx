import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import { locationService } from "@/services";
import type { Location } from "@/types";

export function LocationRowMenu({
  location,
  onEdit,
}: {
  location: Location;
  onEdit: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useMutation({
    mutationFn: () => locationService.remove(location.id),
    onSuccess: () => {
      setConfirmDelete(false);
      void qc.invalidateQueries({ queryKey: ["locations"] });
      void qc.invalidateQueries({ queryKey: ["location", location.id] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${location.name} deleted`);
      void navigate({ to: "/locations" });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not delete location.");
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
            aria-label={`Actions for ${location.name}`}
            disabled={remove.isPending}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {remove.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit
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

      <E3Modal
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && remove.isPending) return;
          setConfirmDelete(open);
        }}
        title={`Delete ${location.name}?`}
        description="Unpair all screens at this location first. This cannot be undone."
        footer={
          <>
            <E3Button variant="outline" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>
              Cancel
            </E3Button>
            <E3Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete location
            </E3Button>
          </>
        }
      />
    </div>
  );
}
