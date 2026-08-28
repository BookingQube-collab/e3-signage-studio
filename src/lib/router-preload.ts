import type { QueryClient } from "@tanstack/react-query";

type RouterContext = { queryClient?: QueryClient };

/** True when createRouter context (or queryClient) is missing during preload. */
export function hasQueryClientContext(
  context: RouterContext | undefined | null,
): context is { queryClient: QueryClient } {
  return context != null && context.queryClient != null;
}

/**
 * TanStack router-core 1.171.15 reads match._nonReactive after an await in
 * preloadRoute. If the cached match was evicted (hover then click, or
 * invalidate), getMatch() is undefined and that read throws.
 * @see https://github.com/TanStack/router/issues/7759
 */
export function isEvictedPreloadMatchError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    typeof error.message === "string" &&
    error.message.includes("_nonReactive")
  );
}

export async function safePreloadRoute<T>(
  context: RouterContext | undefined | null,
  run: () => Promise<T>,
): Promise<T | undefined> {
  if (!hasQueryClientContext(context)) return undefined;
  try {
    return await run();
  } catch (error) {
    if (isEvictedPreloadMatchError(error)) return undefined;
    throw error;
  }
}
