import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { invert, EVENT_LOCATION_TYPES, UI_LOCATION_TYPE, UI_ROLE } from "@e3/shared-types";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  E3Button,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3Modal,
  E3PageHeader,
  E3QueryBoundary,
  E3StatusBadge,
  E3Table,
  type E3Column,
} from "@/components/e3";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateUserDialog } from "@/features/users/CreateUserDialog";
import { UserRowMenu } from "@/features/users/UserRowMenu";
import { listLocationOptionsFn } from "@/lib/auth-functions";
import { isProtectedSuperAdminEmail, requiresLocationAssignment } from "@/lib/location-scope";
import { getBrowserAccessToken } from "@/lib/supabase";
import { userService } from "@/services";
import type { User, UserRole } from "@/types";

export const Route = createFileRoute("/_shell/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — E3 Digital Signage" },
      {
        name: "description",
        content: "Manage admin users, roles and location-scoped permissions for E3 signage.",
      },
      { property: "og:title", content: "Users & Roles — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Manage admin users, roles and location-scoped permissions for E3 signage.",
      },
    ],
  }),
  component: UsersPage,
});

const ROLES: { role: UserRole; permissions: string }[] = [
  { role: "Super Admin", permissions: "Full access to every location, device and setting" },
  {
    role: "Marketing",
    permissions: "Upload media, build playlists and layouts, publish campaigns",
  },
  {
    role: "Site Supervisor",
    permissions:
      "Assigned locations only: dashboard, screens, media, playlists, layouts, campaigns, schedule and reports",
  },
  { role: "Event Manager", permissions: "Create and schedule campaigns for event locations" },
];

const ROLE_FROM_UI = invert(UI_ROLE);

function UsersPage() {
  const { auth } = Route.useRouteContext();
  const qc = useQueryClient();
  const currentUserId = auth?.ok ? auth.userId : undefined;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Site Supervisor" as UserRole,
    locationIds: [] as string[],
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: userService.list,
  });

  const locationsQuery = useQuery({
    queryKey: ["users", "location-options"],
    queryFn: async () => {
      const accessToken = await getBrowserAccessToken();
      return listLocationOptionsFn({ data: { accessToken } });
    },
  });
  const locationOptions = locationsQuery.data ?? [];
  const assignableLocations =
    ROLE_FROM_UI[form.role] === "EVENT_MANAGER"
      ? locationOptions.filter((loc) =>
          (EVENT_LOCATION_TYPES as readonly string[]).includes(loc.type),
        )
      : locationOptions;
  const inviteNeedsLocations = requiresLocationAssignment(ROLE_FROM_UI[form.role]);

  const saveUser = useMutation({
    mutationFn: (user: User) => userService.save(user),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      setEditing(null);
      toast.success("User updated");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update user");
    },
  });

  const columns: E3Column<User>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="e3-gradient grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white">
            {u.name
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{u.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {u.username ? `@${u.username}` : null}
              {u.username && u.email ? " · " : null}
              {u.email || (!u.username ? "No email" : null)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => {
        const locked = isProtectedSuperAdminEmail(u.email);
        return (
        <Select
          value={u.role}
          disabled={locked || saveUser.isPending}
          onValueChange={(v) => {
            const next = v as UserRole;
            if (requiresLocationAssignment(ROLE_FROM_UI[next]) && u.locationIds.length === 0) {
              setEditing(u);
              setForm({
                name: u.name,
                email: u.email,
                role: next,
                locationIds: u.locationIds,
              });
              return;
            }
            saveUser.mutate({ ...u, role: next });
          }}
        >
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.role} value={r.role}>
                {r.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        );
      },
    },
    {
      key: "locations",
      header: "Locations",
      cell: (u) => (
        <button
          type="button"
          className="text-left text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => {
            setEditing(u);
            setForm({
              name: u.name,
              email: u.email,
              role: u.role,
              locationIds: u.locationIds,
            });
          }}
        >
          {u.locationIds.length === 0
            ? requiresLocationAssignment(ROLE_FROM_UI[u.role])
              ? "None assigned"
              : "All locations"
            : `${u.locationIds.length} assigned`}
        </button>
      ),
    },
    { key: "last", header: "Last active", cell: (u) => u.lastActive },
    { key: "status", header: "Status", cell: (u) => <E3StatusBadge status={u.status} /> },
    {
      key: "actions",
      header: "Actions",
      className: "w-14 text-right",
      cell: (u) => (
        <UserRowMenu
          user={u}
          currentUserId={currentUserId}
          onEdit={() => {
            setEditing(u);
            setForm({
              name: u.name,
              email: u.email,
              role: u.role,
              locationIds: u.locationIds,
            });
          }}
        />
      ),
    },
  ];

  function locationToggle(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      locationIds: checked ? [...prev.locationIds, id] : prev.locationIds.filter((x) => x !== id),
    }));
  }

  return (
    <div>
      <E3PageHeader
        title="Users & roles"
        description="Who can access the E3 signage network and what they can change."
        actions={
          <E3Button variant="primary" onClick={() => setOpen(true)}>
            <UserPlus /> Add user
          </E3Button>
        }
      />

      <div className="space-y-6">
        <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
          <E3Table columns={columns} rows={data ?? []} rowKey={(u) => u.id} caption="Admin users" />
        </E3QueryBoundary>

        <E3Card>
          <E3CardHeader
            title="Role permissions"
            description="Reference matrix for the four E3 roles"
          />
          <E3CardBody className="space-y-3">
            {ROLES.map((r) => (
              <div
                key={r.role}
                className="grid gap-1 rounded-xl border border-border p-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"
              >
                <p className="text-sm font-semibold">{r.role}</p>
                <p className="text-sm text-muted-foreground">{r.permissions}</p>
              </div>
            ))}
          </E3CardBody>
        </E3Card>
      </div>

      <CreateUserDialog
        open={open}
        onOpenChange={setOpen}
        locationOptions={locationOptions}
      />

      <E3Modal
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && saveUser.isPending) return;
          if (!next) setEditing(null);
        }}
        title="Assign locations"
        description="Change this user's role and which locations they can access."
        footer={
          <>
            <E3Button variant="ghost" disabled={saveUser.isPending} onClick={() => setEditing(null)}>
              Cancel
            </E3Button>
            <E3Button
              variant="primary"
              loading={saveUser.isPending}
              disabled={
                !editing ||
                (inviteNeedsLocations && form.locationIds.length === 0)
              }
              onClick={() => {
                if (!editing) return;
                saveUser.mutate({ ...editing, role: form.role, locationIds: form.locationIds });
              }}
            >
              Save
            </E3Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="e-role">Role</Label>
            <Select
              value={form.role}
              disabled={Boolean(editing && isProtectedSuperAdminEmail(editing.email))}
              onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
            >
              <SelectTrigger id="e-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.role} value={r.role}>
                    {r.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {locationOptions.length > 0 ? (
            <div className="space-y-2">
              <Label>Assigned locations</Label>
              <div className="space-y-2 rounded-xl border border-border p-3">
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
              No locations in the database yet. Super Admins and Marketing see all locations by
              default.
            </p>
          )}
        </div>
      </E3Modal>
    </div>
  );
}
