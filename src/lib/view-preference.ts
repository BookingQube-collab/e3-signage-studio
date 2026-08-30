import { useCallback, useSyncExternalStore } from "react";

/** localStorage key pattern: `e3.view.<page>` = layout id (e.g. list | grid). */
export const VIEW_PREF_PREFIX = "e3.view.";

/** localStorage key for desktop AppShell sidebar. Default when unset: collapsed. */
export const SIDEBAR_COLLAPSED_KEY = "e3.sidebar.collapsed";

const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of set) listener();
}

function subscribeKey(key: string, onStoreChange: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onStoreChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) onStoreChange();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    set!.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function viewStorageKey(page: string): string {
  return `${VIEW_PREF_PREFIX}${page}`;
}

export function getStoredPreference(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStoredPreference(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
  notify(key);
}

export function getViewPreference<T extends string>(
  page: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = getStoredPreference(viewStorageKey(page));
  if (raw !== null && (allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  return fallback;
}

export function setViewPreference(page: string, value: string): void {
  setStoredPreference(viewStorageKey(page), value);
}

/**
 * Persist a list/grid (or similar) layout until the user explicitly toggles it.
 * SSR / first hydration uses `fallback`; after mount the stored value wins.
 */
export function useViewPreference<T extends string>(
  page: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const key = viewStorageKey(page);
  const subscribe = useCallback((onStoreChange: () => void) => subscribeKey(key, onStoreChange), [key]);
  const getSnapshot = useCallback(
    () => getViewPreference(page, allowed, fallback),
    [page, allowed, fallback],
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setView = useCallback(
    (value: T) => {
      if (!(allowed as readonly string[]).includes(value)) return;
      setViewPreference(page, value);
    },
    [page, allowed],
  );

  return [view, setView];
}

export function getSidebarCollapsed(fallback = true): boolean {
  const raw = getStoredPreference(SIDEBAR_COLLAPSED_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

export function setSidebarCollapsed(collapsed: boolean): void {
  setStoredPreference(SIDEBAR_COLLAPSED_KEY, collapsed ? "true" : "false");
}

/** Desktop sidebar: default collapsed when no preference is stored. */
export function useSidebarCollapsed(): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeKey(SIDEBAR_COLLAPSED_KEY, onStoreChange),
    [],
  );
  const getSnapshot = useCallback(() => getSidebarCollapsed(true), []);
  const getServerSnapshot = useCallback(() => true, []);

  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCollapsed = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(getSidebarCollapsed(true)) : next;
    setSidebarCollapsed(value);
  }, []);

  return [collapsed, setCollapsed];
}
