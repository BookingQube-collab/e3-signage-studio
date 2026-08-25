import { AlertOctagon } from "lucide-react";
import type { ReactNode } from "react";

import { E3Button } from "@/components/e3/E3Button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function E3Skeletons({
  count = 4,
  className,
  itemClassName,
}: {
  count?: number;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-36 rounded-2xl", itemClassName)} />
      ))}
    </div>
  );
}

export function E3ErrorState({
  title = "Couldn't load this data",
  description = "Something went wrong while contacting the service. Try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center"
    >
      <AlertOctagon className="mb-3 size-6 text-destructive" aria-hidden />
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <E3Button className="mt-5" variant="outline" onClick={onRetry}>
          Try again
        </E3Button>
      ) : null}
    </div>
  );
}

/** Renders loading / error / content for a TanStack Query result. */
export function E3QueryBoundary({
  isLoading,
  isError,
  refetch,
  skeleton,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  refetch?: () => void;
  skeleton?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) return <>{skeleton ?? <E3Skeletons />}</>;
  if (isError) return <E3ErrorState onRetry={refetch} />;
  return <>{children}</>;
}
