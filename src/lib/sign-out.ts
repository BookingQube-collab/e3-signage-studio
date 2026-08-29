import type { QueryClient } from "@tanstack/react-query";

const SIGN_OUT_FLAG = "e3-cms-signed-out";
export const SIGN_OUT_WAIT_MS = 1200;

let signingOut = false;

export function isSigningOut(): boolean {
  return signingOut;
}

export function markSigningOut(): void {
  signingOut = true;
  try {
    sessionStorage.setItem(SIGN_OUT_FLAG, "1");
  } catch {
    // Private mode / SSR
  }
}

export function consumeSignedOutFlag(): boolean {
  try {
    if (sessionStorage.getItem(SIGN_OUT_FLAG) !== "1") return false;
    sessionStorage.removeItem(SIGN_OUT_FLAG);
    return true;
  } catch {
    return false;
  }
}

/** Resolve on success, timeout, or rejection — never hang the UI. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

async function signOutLocally(): Promise<void> {
  try {
    const { ensurePublicSupabaseConfig, getSupabase } = await import("./supabase.ts");
    await withTimeout(ensurePublicSupabaseConfig(), 800);
    const client = getSupabase();
    void client.auth.signOut({ scope: "global" }).catch(() => undefined);
    await withTimeout(client.auth.signOut({ scope: "local" }), SIGN_OUT_WAIT_MS);
  } catch {
    // Config or client missing — cookies still need to be cleared.
  }
}

/** Drop the browser session, httpOnly cookies, and in-memory auth cache. */
export async function completeSignOut(queryClient: QueryClient): Promise<void> {
  markSigningOut();
  const { clearShellAuth } = await import("./query-defaults.ts");
  const { clearBrowserAccessTokenCache } = await import("./supabase.ts");
  clearShellAuth(queryClient);
  clearBrowserAccessTokenCache();
  queryClient.clear();
  await signOutLocally();
  try {
    const { clearSessionFn } = await import("./auth-functions.ts");
    await withTimeout(clearSessionFn(), SIGN_OUT_WAIT_MS);
  } catch {
    // Cookie clear is retried on /login via consumeSignedOutFlag.
  }
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  window.location.assign("/login?loggedOut=1");
}
