import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  { role: "Marketing", permissions: "Upload media, build playlists and layouts, publish campaigns" },
  {
    role: "Site Supervisor",
    permissions: "Manage screens, playback and schedules for assigned locations",
  },
  { role: "Event Manager", permissions: "Create and schedule campaigns for event locations" },
];

function UsersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "Event Manager" as UserRole });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: userService.list,
  });

  const invite = useMutation({
    mutationFn: (input: { name: string; email: string; role: UserRole }) =>
      userService.save({
        id: `usr-${Date.now()}`,
        name: input.name,
        email: input.email,
        role: input.role,
        locationIds: [],
        status: "Invited",
        lastActive: "Never",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
      setForm({ name: "", email: "", role: "Event Manager" });
      toast.success("Invitation sent");
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
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (u) => u.role },
    {
      key: "locations",
      header: "Locations",
      cell: (u) => (u.locationIds.length === 0 ? "All locations" : `${u.locationIds.length} assigned`),
    },
    { key: "last", header: "Last active", cell: (u) => u.lastActive },
    { key: "status", header: "Status", cell: (u) => <E3StatusBadge status={u.status} /> },
  ];

  return (
    <div>
      <E3PageHeader
        title="Users & roles"
        description="Who can access the E3 signage network and what they can change."
        actions={
          <E3Button variant="primary" onClick={() => setOpen(true)}>
            <UserPlus /> Invite user
          </E3Button>
        }
      />

      <div className="space-y-6">
        <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
          <E3Table columns={columns} rows={data ?? []} rowKey={(u) => u.id} caption="Admin users" />
        </E3QueryBoundary>

        <E3Card>
          <E3CardHeader title="Role permissions" description="Reference matrix for the four E3 roles" />
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

      <E3Modal
        open={open}
        onOpenChange={setOpen}
        title="Invite user"
        description="They'll receive an email invitation to join the E3 admin panel."
        footer={
          <>
            <E3Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </E3Button>
            <E3Button
              variant="primary"
              disabled={!form.name.trim() || !form.email.includes("@") || invite.isPending}
              onClick={() =>
                invite.mutate({ name: form.name.trim(), email: form.email.trim(), role: form.role })
              }
            >
              Send invite
            </E3Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="u-name">Full name</Label>
            <Input
              id="u-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Layla Hassan"
            />
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="u-role">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
              <SelectTrigger id="u-role">
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
        </div>
      </E3Modal>
    </div>
  );
}
