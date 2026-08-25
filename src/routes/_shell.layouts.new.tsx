import { createFileRoute } from "@tanstack/react-router";

import { LayoutBuilder, presetZones } from "@/features/layouts/LayoutBuilder";

export const Route = createFileRoute("/_shell/layouts/new")({
  head: () => ({
    meta: [
      { title: "New layout — E3 Digital Signage" },
      { name: "description", content: "Design a new multi-zone screen layout." },
      { property: "og:title", content: "New layout — E3 Digital Signage" },
      { property: "og:description", content: "Design a new multi-zone screen layout." },
    ],
  }),
  component: NewLayoutPage,
});

function NewLayoutPage() {
  return (
    <LayoutBuilder
      initial={{
        id: `lay-${Date.now()}`,
        name: "",
        preset: "Video + Side Banner",
        orientation: "Landscape",
        resolution: "1920 × 1080",
        background: "#19161A",
        zones: presetZones("Video + Side Banner"),
        modifiedAt: new Date().toISOString().slice(0, 10),
        usedByScreens: 0,
      }}
    />
  );
}
