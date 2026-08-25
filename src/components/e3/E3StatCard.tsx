import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function E3StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "neutral",
  highlight,
  className,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  highlight?: boolean;
  className?: string;
}) {
  const toneText = {
    neutral: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    info: "text-info",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-2xl bg-card p-5",
        highlight ? "e3-gradient-border" : "border border-border",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon ? <Icon className={cn("size-4 shrink-0", toneText)} aria-hidden /> : null}
      </div>
      <p className={cn("font-display mt-3 text-3xl font-bold tabular-nums", toneText)}>{value}</p>
      {sublabel ? <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p> : null}
    </div>
  );
}
