import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Pencil, Trash2, UserX } from "lucide-react";
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
import { isProtectedSuperAdminEmail } from "@/lib/location-scope";
import { removeById, writeEntityCache } from "@/lib/query-cache";
import { userService } from "@/services";
import type { User } from "@/types";

export function UserRowMenu({
  user,
  currentUserId,
  isLastSuperAdmin,
  onEdit,
}: {
  user: User;
  currentUserId?: string | undefined;
  isLastSuperAdmin?: boolean;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = isProtectedSuperAdminEmail(user.email);
  const isSelf = Boolean(currentUserId && currentUserId === user.id);
  const disabled = user.status === "Disabled";
  const canToggle = !locked && !isSelf;
  const canDelete = !locked && !isSelf && !isLastSuperAdmin;

  const save = useMutation({
    mutationFn: () =>
      userService.save({ ...user, status: disabled ? "Active" : "Disabled" }),
    onSuccess: (next) => {
      setConfirm(false);
      writeEntityCache(qc, {
        detailKey: ["user", next.id],
        listKey: ["users"],
        entity: next,
      });
      toast.success(next.status === "Disabled" ? `${next.name} disabled` : `${next.name} enabled`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not update user.");
    },
  });

  const remove = useMutation({
    mutationFn: () => userService.remove(user.id),
    onSuccess: () => {
      setConfirmDelete(false);
      qc.setQueryData(["users"], (prev: User[] | undefined) =>
        removeById(Array.isArray(prev) ? prev : [], user.id),
      );
      toast.success(`${user.name} deleted`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not delete user.");
    },
  });

  const busy = save.isPending || remove.isPending;

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
            aria-label={`Actions for ${user.name}`}
            disabled={busy}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          {canToggle ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={disabled ? undefined : "text-destructive focus:text-destructive"}
                onSelect={() => setConfirm(true)}
              >
                <UserX />
                {disabled ? "Enable" : "Deactivate"}
              </DropdownMenuItem>
            </>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <E3Modal
        open={confirm}
        onOpenChange={(open) => {
          if (!open && busy) return;
          setConfirm(open);
        }}
        title={disabled ? `Enable ${user.name}?` : `Deactivate ${user.name}?`}
        description={
          disabled
            ? "They will be able to sign in again."
            : "They will no longer be able to sign in. You can enable the account later."
        }
        footer={
          <>
            <E3Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
              Cancel
            </E3Button>
            <E3Button
              variant={disabled ? "primary" : "danger"}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              {disabled ? "Enable user" : "Deactivate user"}
            </E3Button>
          </>
        }
      />

      <E3Modal
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && remove.isPending) return;
          setConfirmDelete(open);
        }}
        title={`Delete ${user.name}?`}
        description="This permanently removes their CMS profile and sign-in. They will not be able to access the studio."
        footer={
          <>
            <E3Button variant="outline" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>
              Cancel
            </E3Button>
            <E3Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete user
            </E3Button>
          </>
        }
      />
    </div>
  );
}
