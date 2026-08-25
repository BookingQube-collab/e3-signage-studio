import { createFileRoute } from "@tanstack/react-router";

import { PlaylistBuilder } from "@/features/playlists/PlaylistBuilder";

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
  return (
    <PlaylistBuilder
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
