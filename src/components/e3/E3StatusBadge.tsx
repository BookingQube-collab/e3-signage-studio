import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-destructive/15 text-destructive border-destructive/35",
  info: "bg-info/15 text-info border-info/30",
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-e3-purple/15 text-e3-pink border-e3-purple/35",
};

const statusToneMap: Record<string, StatusTone> = {
  online: "success",
  ready: "success",
  active: "success",
  updated: "success",
  syncing: "info",
  downloading: "info",
  verifying: "info",
  publishing: "info",
  upcoming: "info",
  scheduled: "info",
  waiting: "warning",
  notified: "info",
  pending: "warning",
  paused: "warning",
  draft: "neutral",
  invited: "warning",
  offline: "danger",
  failed: "danger",
  disabled: "neutral",
  inactive: "neutral",
  archived: "neutral",
  expired: "neutral",
};

export function statusTone(status: string): StatusTone {
  return statusToneMap[status.toLowerCase()] ?? "neutral";
}

export function E3StatusBadge({
  status,
  tone,
  dot = true,
  className,
}: {
  status: string;
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
}) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        toneClasses[resolved],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {status}
    </span>
  );
}
