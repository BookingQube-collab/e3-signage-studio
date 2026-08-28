import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function E3Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          className={cn(
            "flex max-h-[min(90vh,90dvh)] flex-col gap-4 overflow-hidden rounded-2xl border-border bg-card sm:max-w-lg",
            className,
          )}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="font-display text-xl font-semibold">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          ) : null}
          {footer ? (
            <DialogFooter className="shrink-0 gap-2 border-t border-border pt-4">
              {footer}
            </DialogFooter>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
