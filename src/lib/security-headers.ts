/** Applied to CMS HTML and device JSON. CSP allows Google Fonts, Supabase Auth, and R2 signed uploads. */

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel.app https://*.r2.cloudflarestorage.com https://*.eu.r2.cloudflarestorage.com",
    "upgrade-insecure-requests",
  ].join("; "),
};

export function withSecurityHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return { ...SECURITY_HEADERS, ...headers };
}
