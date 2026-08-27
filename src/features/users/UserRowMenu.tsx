import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Pencil, UserX } from "lucide-react";
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
import { userService } from "@/services";
import type { User } from "@/types";

export function UserRowMenu({
  user,
  currentUserId,
  onEdit,
}: {
  user: User;
  currentUserId?: string | undefined;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const locked = isProtectedSuperAdminEmail(user.email);
  const isSelf = Boolean(currentUserId && currentUserId === user.id);
  const disabled = user.status === "Disabled";
  const canToggle = !locked && !isSelf;

  const save = useMutation({
    mutationFn: () =>
      userService.save({ ...user, status: disabled ? "Active" : "Disabled" }),
    onSuccess: (next) => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(next.status === "Disabled" ? `${next.name} disabled` : `${next.name} enabled`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not update user.");
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
            aria-label={`Actions for ${user.name}`}
            disabled={save.isPending}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {save.isPending ? (
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
        </DropdownMenuContent>
      </DropdownMenu>

      <E3Modal
        open={confirm}
        onOpenChange={(open) => {
          if (!open && save.isPending) return;
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
            <E3Button variant="outline" disabled={save.isPending} onClick={() => setConfirm(false)}>
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
    </div>
  );
}
