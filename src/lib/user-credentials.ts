/** Reserved RFC 2606 domain used when a CMS user has no real email. */
export const SYNTHETIC_LOGIN_DOMAIN = "cms.e3.invalid";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameError(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (username.length < 3) return "Username must be at least 3 characters.";
  if (username.length > 32) return "Username must be at most 32 characters.";
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    return "Use letters, numbers, dots, hyphens, or underscores.";
  }
  return null;
}

export function assertUsername(raw: string): string {
  const username = normalizeUsername(raw);
  const error = usernameError(raw);
  if (error) throw new Error(error);
  return username;
}

export function passwordError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 72) return "Password is too long.";
  return null;
}

export function assertPassword(password: string): void {
  const error = passwordError(password);
  if (error) throw new Error(error);
}

export function syntheticEmailForUsername(username: string): string {
  return `${normalizeUsername(username)}@${SYNTHETIC_LOGIN_DOMAIN}`;
}

export function isSyntheticLoginEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${SYNTHETIC_LOGIN_DOMAIN}`);
}

export function looksLikeEmail(identifier: string): boolean {
  return identifier.trim().includes("@");
}

/** Map a login field to the Auth email without a second Admin API round-trip. */
export function loginEmailForIdentifier(
  identifier: string,
  profileEmail?: string | null,
): string {
  const trimmed = identifier.trim();
  if (!trimmed) return syntheticEmailForUsername("unknown");
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase();
  return authEmailForUser({
    username: normalizeUsername(trimmed) || "unknown",
    email: profileEmail,
  });
}

export function authEmailForUser(input: { username: string; email?: string | null }): string {
  const email = input.email?.trim() ?? "";
  if (email) return email;
  return syntheticEmailForUsername(input.username);
}
