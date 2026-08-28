export const LOGIN_RATE_LIMIT_WAIT_MS = 600;
export const LOGIN_RESOLVE_WAIT_MS = 4_000;
export const LOGIN_AUTH_WAIT_MS = 8_000;
export const LOGIN_PERSIST_WAIT_MS = 2_500;
export const LOGIN_PAGE_TOKEN_WAIT_MS = 600;
export const LOGIN_PAGE_SESSION_WAIT_MS = 2_000;
export const LOGIN_PAGE_CONFIG_WAIT_MS = 2_000;

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
