import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Mark keys stale and refetch in parallel without blocking the mutation UI. */
export function invalidateKeysInBackground(
  queryClient: QueryClient,
  keys: QueryKey[],
): void {
  void Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const without = items.filter((row) => row.id !== item.id);
  return [item, ...without];
}

export function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((row) => row.id !== id);
}

/** Write mutation result into detail + list caches so UI updates before background refetch. */
export function writeEntityCache<T extends { id: string }>(
  queryClient: QueryClient,
  options: {
    detailKey: QueryKey;
    listKey: QueryKey;
    entity: T;
  },
): void {
  queryClient.setQueryData(options.detailKey, options.entity);
  queryClient.setQueryData<T[]>(options.listKey, (prev) =>
    upsertById(Array.isArray(prev) ? prev : [], options.entity),
  );
}
