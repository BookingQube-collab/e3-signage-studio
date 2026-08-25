import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface E3CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Draw a 1px E3 gradient edge instead of the default subtle border. */
  gradientEdge?: boolean;
  children: ReactNode;
}

export function E3Card({ gradientEdge, className, children, ...props }: E3CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-card text-card-foreground shadow-sm transition-colors",
        gradientEdge ? "e3-gradient-border border-0" : "border border-border",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function E3CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="font-display truncate text-lg font-semibold">{title}</h3>
        {description ? (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function E3CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
