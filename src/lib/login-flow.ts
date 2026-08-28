import { loginEmailForIdentifier } from "./user-credentials.ts";

export const LOGIN_RATE_LIMIT_WAIT_MS = 600;
export const LOGIN_RESOLVE_WAIT_MS = 8_000;
export const LOGIN_AUTH_WAIT_MS = 20_000;
export const LOGIN_PERSIST_WAIT_MS = 2_500;
export const LOGIN_PAGE_TOKEN_WAIT_MS = 600;
export const LOGIN_PAGE_SESSION_WAIT_MS = 2_000;
export const LOGIN_PAGE_CONFIG_WAIT_MS = 2_000;

/** Prefer the server lookup; fall back to the synthetic username email so login still proceeds. */
export function emailAfterUsernameLookup(
  identifier: string,
  lookedUp?: { email?: string } | null,
): string {
  const fromLookup = lookedUp?.email?.trim();
  if (fromLookup) return fromLookup;
  return loginEmailForIdentifier(identifier);
}

export function shouldSkipLoginSessionRedirect(input: {
  loggedOut?: boolean;
  signedOutFlag: boolean;
  accessToken: string;
}): boolean {
  if (input.loggedOut || input.signedOutFlag) return true;
  return !input.accessToken;
}

export function redirectToDashboard(): void {
  if (typeof window === "undefined") return;
  window.location.assign("/dashboard");
}
