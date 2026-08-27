import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False on the server and during hydration, then true — keeps first paint identical. */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
