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
import { layoutService } from "@/services";
import { removeById } from "@/lib/query-cache";
import type { Layout } from "@/types";

export function LayoutRowMenu({ layout }: { layout: Layout }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useMutation({
    mutationFn: () => layoutService.remove(layout.id),
    onSuccess: () => {
      setConfirmDelete(false);
      qc.setQueryData(["layouts"], (prev: Layout[] | undefined) =>
        removeById(Array.isArray(prev) ? prev : [], layout.id),
      );
      qc.removeQueries({ queryKey: ["layout", layout.id] });
      toast.success(`${layout.name} deleted`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not delete layout.");
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
            aria-label={`Actions for ${layout.name}`}
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
          <DropdownMenuItem
            onSelect={() => void navigate({ to: "/layouts/$id", params: { id: layout.id } })}
          >
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
        title={`Delete ${layout.name}?`}
        description="Remove this layout from campaigns and playlists first. This cannot be undone."
        footer={
          <>
            <E3Button variant="outline" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>
              Cancel
            </E3Button>
            <E3Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete layout
            </E3Button>
          </>
        }
      />
    </div>
  );
}
