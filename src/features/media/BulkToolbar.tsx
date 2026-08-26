import { FolderInput, Trash2, X } from "lucide-react";

import { E3Button } from "@/components/e3";
import { selectionCountLabel } from "@/lib/media-bulk";

export function BulkToolbar({
  count,
  visibleCount,
  allSelected,
  onSelectAll,
  onClear,
  onMove,
  onDelete,
  busy,
}: {
  count: number;
  visibleCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onMove: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div
      className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-sm backdrop-blur"
      role="toolbar"
      aria-label="Bulk media actions"
    >
      <p className="mr-2 text-sm font-medium">{selectionCountLabel(count)}</p>
      <E3Button size="sm" variant="outline" onClick={onMove} disabled={busy}>
        <FolderInput /> Move to
      </E3Button>
      <E3Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>
        <Trash2 /> Delete
      </E3Button>
      <E3Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
        <X /> Clear selection
      </E3Button>
      <div className="ml-auto">
        <E3Button size="sm" variant="ghost" onClick={onSelectAll} disabled={visibleCount === 0 || busy}>
          {allSelected ? "All selected" : "Select all"}
        </E3Button>
      </div>
    </div>
  );
}
