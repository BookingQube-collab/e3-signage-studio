import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { E3Button, E3EmptyState, E3QueryBoundary } from "@/components/e3";
import { LayoutBuilder } from "@/features/layouts/LayoutBuilder";
import { layoutService } from "@/services";

export const Route = createFileRoute("/_shell/layouts/$id")({
  head: () => ({
    meta: [
      { title: "Edit layout — E3 Digital Signage" },
      { name: "description", content: "Configure zones, content and fit modes for a layout." },
      { property: "og:title", content: "Edit layout — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Configure zones, content and fit modes for a layout.",
      },
    ],
  }),
  component: EditLayoutPage,
});

function EditLayoutPage() {
  const { id } = Route.useParams();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["layout", id],
    queryFn: () => layoutService.get(id),
    throwOnError: false,
  });

  return (
    <E3QueryBoundary isLoading={isPending} isError={isError} refetch={() => void refetch()}>
      {data ? (
        <LayoutBuilder
          key={data.id}
          initial={{
            ...data,
            zones: Array.isArray(data.zones) ? data.zones : [],
          }}
        />
      ) : (
        <E3EmptyState
          title="Layout not found"
          description="It may have been deleted."
          action={
            <E3Button variant="outline" asChild>
              <Link to="/layouts">Back to layouts</Link>
            </E3Button>
          }
        />
      )}
    </E3QueryBoundary>
  );
}
