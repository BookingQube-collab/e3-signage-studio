import { ShieldAlert } from "lucide-react";

import { E3Alert, E3EmptyState } from "@/components/e3";

export function PermissionDenied({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <E3Alert severity="warning" title={title} detail={description} />
      <E3EmptyState icon={ShieldAlert} title={title} description={description} />
    </div>
  );
}
