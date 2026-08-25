import { cn } from "@/lib/utils";

export function E3Progress({
  value,
  label,
  tone = "gradient",
  className,
}: {
  value: number;
  label?: string;
  tone?: "gradient" | "success" | "warning" | "danger";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fill =
    tone === "gradient"
      ? "e3-gradient"
      : tone === "success"
        ? "bg-success"
        : tone === "warning"
          ? "bg-warning"
          : "bg-destructive";

  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{label}</span>
          <span className="shrink-0 tabular-nums">{clamped}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
