import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invert, EVENT_LOCATION_TYPES, UI_LOCATION_TYPE, UI_ROLE } from "@e3/shared-types";
import { KeyRound, Mail } from "lucide-react";
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
import type { LocationOption } from "@/lib/auth-types";
import { inviteUserFn, createUserFn } from "@/lib/auth-functions";
import { requiresLocationAssignment } from "@/lib/location-scope";
import { getBrowserAccessToken } from "@/lib/supabase";
import { passwordError, usernameError } from "@/lib/user-credentials";
import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

const ROLE_FROM_UI = invert(UI_ROLE);

const ROLES: UserRole[] = ["Super Admin", "Marketing", "Site Supervisor", "Event Manager"];

const EMPTY_FORM = {
  name: "",
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
  role: "Site Supervisor" as UserRole,
  locationIds: [] as string[],
};

export function CreateUserDialog({
  open,
  onOpenChange,
  locationOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationOptions: LocationOption[];
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"invite" | "direct">("invite");
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) {
      setMode("invite");
      setForm(EMPTY_FORM);
    }
  }, [open]);

  const needsLocations = requiresLocationAssignment(ROLE_FROM_UI[form.role]);
  const assignableLocations =
    ROLE_FROM_UI[form.role] === "EVENT_MANAGER"
      ? locationOptions.filter((loc) =>
          (EVENT_LOCATION_TYPES as readonly string[]).includes(loc.type),
        )
      : locationOptions;

  const invite = useMutation({
    mutationFn: async () => {
      const accessToken = await getBrowserAccessToken();
      return inviteUserFn({
        data: {
          accessToken,
          name: form.name.trim(),
          email: form.email.trim(),
          role: ROLE_FROM_UI[form.role],
          locationIds: form.locationIds,
        },
      });
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success("Invitation sent");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not send invite");
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const accessToken = await getBrowserAccessToken();
      return createUserFn({
        data: {
          accessToken,
          name: form.name.trim(),
          username: form.username.trim(),
          password: form.password,
          email: form.email.trim(),
          role: ROLE_FROM_UI[form.role],
          locationIds: form.locationIds,
        },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
      toast.success("User created — they can sign in with username and password");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not create user");
    },
  });

  const pending = invite.isPending || create.isPending;
  const userNameOk = usernameError(form.username) === null;
  const passwordOk = passwordError(form.password) === null;
  const passwordsMatch = form.password === form.confirmPassword;
  const emailOptionalOk = !form.email.trim() || form.email.includes("@");
  const locationsOk = !needsLocations || form.locationIds.length > 0;
  const inviteReady = Boolean(form.name.trim() && form.email.includes("@") && locationsOk);
  const createReady = Boolean(
    form.name.trim() && userNameOk && passwordOk && passwordsMatch && emailOptionalOk && locationsOk,
  );

  function locationToggle(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      locationIds: checked ? [...prev.locationIds, id] : prev.locationIds.filter((x) => x !== id),
    }));
  }

  return (
    <E3Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
      title="Add user"
      description="Invite by email, or create a username and password for people who don't have email."
      footer={
        <>
          <E3Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </E3Button>
          {mode === "invite" ? (
            <E3Button
              variant="primary"
              loading={invite.isPending}
              disabled={!inviteReady}
              onClick={() => invite.mutate()}
            >
              Send invite
            </E3Button>
          ) : (
            <E3Button
              variant="primary"
              loading={create.isPending}
              disabled={!createReady}
              onClick={() => create.mutate()}
            >
              Create user
            </E3Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => setMode("invite")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              mode === "invite"
                ? "bg-background text-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Mail className="size-4" />
            Invite
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setMode("direct")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              mode === "direct"
                ? "bg-background text-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <KeyRound className="size-4" />
            Direct create
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {mode === "invite"
            ? "They'll receive an email invitation. Site Supervisors must be assigned one or more locations."
            : "Creates a login they can use immediately. Email is optional."}
        </p>

        <div className="space-y-2">
          <Label htmlFor="u-name">Full name</Label>
          <Input
            id="u-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Layla Hassan"
          />
        </div>

        {mode === "invite" ? (
          <div className="space-y-2">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="layla@e3.qa"
            />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="u-username">Username</Label>
              <Input
                id="u-username"
                autoComplete="off"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="layla.hassan"
              />
              {form.username.trim() && usernameError(form.username) ? (
                <p className="text-xs text-destructive">{usernameError(form.username)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  3–32 characters. Letters, numbers, dots, hyphens, or underscores.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-direct-email">Email (optional)</Label>
              <Input
                id="u-direct-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Leave blank if they have no email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-password">Password</Label>
              <Input
                id="u-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-confirm">Confirm password</Label>
              <Input
                id="u-confirm"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />
              {form.confirmPassword && !passwordsMatch ? (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              ) : null}
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="u-role">Role</Label>
          <Select
            value={form.role}
            onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
          >
            <SelectTrigger id="u-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {locationOptions.length > 0 ? (
          <div className="space-y-2">
            <Label>Assigned locations</Label>
            {needsLocations ? (
              <p className="text-xs text-muted-foreground">
                Required. They only see these locations after login (pick one or more).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Optional for Super Admin and Marketing — they already see every location.
              </p>
            )}
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
              {assignableLocations.map((loc) => (
                <label key={loc.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.locationIds.includes(loc.id)}
                    onChange={(e) => locationToggle(loc.id, e.target.checked)}
                  />
                  <span>
                    {loc.name}
                    {ROLE_FROM_UI[form.role] === "EVENT_MANAGER"
                      ? ` · ${UI_LOCATION_TYPE[loc.type]}`
                      : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No locations in the database yet. Location assignment will appear after locations are
            created.
          </p>
        )}
      </div>
    </E3Modal>
  );
}
