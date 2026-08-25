import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface E3Column<T> {
  key: string;
  header: string;
  className?: string;
  cell: (row: T) => ReactNode;
}

export function E3Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  className,
  caption,
}: {
  columns: E3Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
  caption?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-border bg-card", className)}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter") onRowClick(row);
                    }
                  : undefined
              }
              className={cn(
                "border-b border-border/60 last:border-0 transition-colors",
                onRowClick &&
                  "cursor-pointer hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
