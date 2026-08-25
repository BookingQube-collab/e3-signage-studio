import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

const config = {
  critical: { icon: ShieldAlert, cls: "border-destructive/35 bg-destructive/10 text-destructive" },
  warning: { icon: AlertTriangle, cls: "border-warning/35 bg-warning/10 text-warning" },
  info: { icon: Info, cls: "border-info/35 bg-info/10 text-info" },
} as const;

export function E3Alert({
  severity = "info",
  title,
  detail,
  meta,
  className,
}: {
  severity?: keyof typeof config;
  title: string;
  detail?: string;
  meta?: string;
  className?: string;
}) {
  const { icon: Icon, cls } = config[severity];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      {meta ? <span className="shrink-0 text-xs text-muted-foreground">{meta}</span> : null}
    </div>
  );
}
