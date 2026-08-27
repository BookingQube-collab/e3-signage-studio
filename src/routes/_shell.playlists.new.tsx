import { createFileRoute } from "@tanstack/react-router";

import { PermissionDenied } from "@/components/auth/PermissionDenied";
import { PlaylistBuilder } from "@/features/playlists/PlaylistBuilder";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_shell/playlists/new")({
  head: () => ({
    meta: [
      { title: "New playlist — E3 Digital Signage" },
      { name: "description", content: "Create a new content playlist for E3 screens." },
      { property: "og:title", content: "New playlist — E3 Digital Signage" },
      { property: "og:description", content: "Create a new content playlist for E3 screens." },
    ],
  }),
  component: NewPlaylistPage,
});

function NewPlaylistPage() {
  const { auth } = Route.useRouteContext();
  const canManage = Boolean(auth?.ok && hasPermission(auth.profile.role, "playlists.manage"));
  if (!canManage) {
    return (
      <PermissionDenied
        title="Permission denied"
        description="Your role cannot create playlists. Ask a Super Admin if you need access."
      />
    );
  }

  return (
    <PlaylistBuilder
      canManage
      initial={{
        id: `pl-${Date.now()}`,
        name: "",
        status: "Draft",
        items: [],
        usedByScreens: 0,
        modifiedAt: new Date().toISOString().slice(0, 10),
      }}
    />
  );
}
