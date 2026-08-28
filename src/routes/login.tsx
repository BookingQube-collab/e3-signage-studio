import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useCmsLogoSrc } from "@/components/branding/CmsBranding";
import { E3Button } from "@/components/e3/E3Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearSessionFn, getAuthSessionFn, persistSessionFn, resolveLoginIdentifierFn } from "@/lib/auth-functions";
import { getPublicCmsUrl } from "@/lib/cms-settings";
import {
  emailAfterUsernameLookup,
  LOGIN_AUTH_WAIT_MS,
  LOGIN_PAGE_CONFIG_WAIT_MS,
  LOGIN_PAGE_SESSION_WAIT_MS,
  LOGIN_PAGE_TOKEN_WAIT_MS,
  LOGIN_PERSIST_WAIT_MS,
  LOGIN_RATE_LIMIT_WAIT_MS,
  LOGIN_RESOLVE_WAIT_MS,
  redirectToDashboard,
  shouldSkipLoginSessionRedirect,
} from "@/lib/login-flow";
import {
  peekBrowserAccessToken,
  seedBrowserAuthSession,
  signInWithPasswordGrant,
} from "@/lib/password-grant";
import { getPublicSupabaseConfigFn } from "@/lib/public-config-functions";
import { consumeSignedOutFlag, withTimeout } from "@/lib/sign-out";
import {
  ensurePublicSupabaseConfig,
  getBrowserAccessToken,
  getSupabase,
  seedPublicSupabaseConfig,
} from "@/lib/supabase";
import { looksLikeEmail } from "@/lib/user-credentials";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { loggedOut?: boolean } => ({
    loggedOut:
      search.loggedOut === true || search.loggedOut === "1" || search.loggedOut === "true"
        ? true
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — E3 Digital Signage" },
      {
        name: "description",
        content: "Sign in to the E3 Digital Signage content management system.",
      },
      { property: "og:title", content: "Sign in — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Sign in to the E3 Digital Signage content management system.",
      },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const signedOutFlag = consumeSignedOutFlag();
    if (search.loggedOut || signedOutFlag) {
      void withTimeout(clearSessionFn(), 800);
      return;
    }
    const accessToken =
      peekBrowserAccessToken() ||
      ((await withTimeout(getBrowserAccessToken(), LOGIN_PAGE_TOKEN_WAIT_MS)) ?? "");
    if (shouldSkipLoginSessionRedirect({ signedOutFlag: false, accessToken })) return;
    const auth = await withTimeout(
      getAuthSessionFn({ data: { accessToken } }),
      LOGIN_PAGE_SESSION_WAIT_MS,
    );
    if (auth?.ok) {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async () => {
    const config = await withTimeout(getPublicSupabaseConfigFn(), LOGIN_PAGE_CONFIG_WAIT_MS);
    if (config) seedPublicSupabaseConfig(config);
    return { publicSupabase: config ?? null };
  },
  component: LoginPage,
});

function LoginPage() {
  const { publicSupabase } = Route.useLoaderData();
  seedPublicSupabaseConfig(publicSupabase);
  const [identifier, setIdentifier] = useState("rajan@e3.qa");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!identifier || !password) {
      setError("Enter your username or email, and password to continue.");
      return;
    }
    const config = await withTimeout(ensurePublicSupabaseConfig(), LOGIN_PAGE_CONFIG_WAIT_MS);
    if (!config) {
      setError("Supabase is not configured on the server.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const trimmed = identifier.trim();
      const rateLimit = withTimeout(
        fetch("/api/auth/login-attempt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identifier: trimmed }),
        }).then((res) => res.status),
        LOGIN_RATE_LIMIT_WAIT_MS,
      );
      const resolved = looksLikeEmail(trimmed)
        ? Promise.resolve({ email: trimmed })
        : resolveLoginIdentifierFn({ data: { identifier: trimmed } });
      const [limitedStatus, identity] = await Promise.all([
        rateLimit,
        withTimeout(resolved, LOGIN_RESOLVE_WAIT_MS),
      ]);
      if (limitedStatus === 429) {
        setError("Too many sign-in attempts. Try again in a few minutes.");
        return;
      }
      const email = emailAfterUsernameLookup(trimmed, identity);
      const grant = await signInWithPasswordGrant(config, email, password, LOGIN_AUTH_WAIT_MS);
      if (!grant.ok) {
        setError(grant.message);
        return;
      }
      seedBrowserAuthSession(config.url, grant.session);
      await withTimeout(
        persistSessionFn({
          data: {
            accessToken: grant.session.access_token,
            refreshToken: grant.session.refresh_token,
          },
        }),
        LOGIN_PERSIST_WAIT_MS,
      );
      toast.success("Signed in");
      redirectToDashboard();
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgotPassword() {
    if (resetting || submitting) return;
    if (!identifier) {
      setError("Enter your email to reset your password.");
      return;
    }
    if (!looksLikeEmail(identifier)) {
      setError("Password reset needs an email address. Ask a Super Admin if this account has none.");
      return;
    }
    const config = await withTimeout(ensurePublicSupabaseConfig(), LOGIN_PAGE_CONFIG_WAIT_MS);
    if (!config) {
      setError("Supabase is not configured on the server.");
      return;
    }
    setError(null);
    setResetting(true);
    try {
      const limitedStatus = await withTimeout(
        fetch("/api/auth/login-attempt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identifier }),
        }).then((res) => res.status),
        LOGIN_RATE_LIMIT_WAIT_MS,
      );
      if (limitedStatus === 429) {
        setError("Too many password reset attempts. Try again in a few minutes.");
        return;
      }
      const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(identifier.trim(), {
        redirectTo: `${getPublicCmsUrl()}/login`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      toast.success("Password reset link sent to your email");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setResetting(false);
    }
  }

  const logoSrc = useCmsLogoSrc();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Booth-inspired lighting */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-[-10%] size-[520px] rounded-full opacity-25 blur-[130px]"
        style={{ background: "#E95A9D" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-[-15%] size-[560px] rounded-full opacity-25 blur-[140px]"
        style={{ background: "#5BA2ED" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 size-[420px] -translate-x-1/2 rounded-full opacity-20 blur-[150px]"
        style={{ background: "#5F0BC0" }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src={logoSrc}
            alt="E3"
            width={160}
            height={115}
            fetchPriority="high"
            decoding="async"
            className="mx-auto h-16 w-auto object-contain"
          />
          <h1 className="font-display mt-6 text-2xl font-bold uppercase leading-tight tracking-[0.22em]">
            Digital Signage
          </h1>
          <p className="font-display text-sm uppercase tracking-[0.34em] text-muted-foreground">
            Content Management
          </p>
        </div>

        <div className="e3-gradient-border rounded-2xl bg-card p-6 sm:p-8">
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="identifier">Email or username</Label>
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="h-11 rounded-xl bg-background"
                placeholder="you@e3.qa or username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl bg-background"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <E3Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={submitting}
            >
              Sign In
            </E3Button>

            <div className="text-center">
              <button
                type="button"
                disabled={submitting || resetting}
                onClick={() => void onForgotPassword()}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
              >
                {resetting ? "Sending…" : "Forgot password?"}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          E3 Entertainment · Internal content management
        </p>
      </div>
    </div>
  );
}
