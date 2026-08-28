import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/e3-icon.png";
import { E3Button } from "@/components/e3/E3Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSessionFn, persistSessionFn, resolveLoginIdentifierFn } from "@/lib/auth-functions";
import { getPublicCmsUrl } from "@/lib/cms-settings";
import { getPublicSupabaseConfigFn } from "@/lib/public-config-functions";
import {
  ensurePublicSupabaseConfig,
  getBrowserAccessToken,
  getSupabase,
  seedPublicSupabaseConfig,
} from "@/lib/supabase";
import { looksLikeEmail } from "@/lib/user-credentials";

export const Route = createFileRoute("/login")({
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
  beforeLoad: async () => {
    const accessToken = await getBrowserAccessToken();
    const auth = await getAuthSessionFn({ data: { accessToken } });
    if (auth.ok) {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async () => {
    try {
      const config = await getPublicSupabaseConfigFn();
      seedPublicSupabaseConfig(config);
      return { publicSupabase: config };
    } catch {
      return { publicSupabase: null };
    }
  },
  component: LoginPage,
});

function mapLoginError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Invalid username, email, or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Network error. Check your connection.";
  }
  return message || "Could not sign in.";
}

function LoginPage() {
  const { publicSupabase } = Route.useLoaderData();
  seedPublicSupabaseConfig(publicSupabase);
  const navigate = useNavigate();
  const router = useRouter();
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
    const config = await ensurePublicSupabaseConfig();
    if (!config) {
      setError("Supabase is not configured on the server.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const limited = await fetch("/api/auth/login-attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      if (limited.status === 429) {
        setError("Too many sign-in attempts. Try again in a few minutes.");
        return;
      }
      const resolved = looksLikeEmail(identifier)
        ? { email: identifier.trim() }
        : await resolveLoginIdentifierFn({ data: { identifier: identifier.trim() } });
      const { data, error: signError } = await getSupabase().auth.signInWithPassword({
        email: resolved.email,
        password,
      });
      if (signError) {
        setError(mapLoginError(signError.message));
        return;
      }
      if (!data.session) {
        setError("Confirm your email before signing in.");
        return;
      }
      await persistSessionFn({
        data: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
      });
      toast.success("Signed in");
      await router.invalidate();
      await navigate({ to: "/dashboard" });
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
    const config = await ensurePublicSupabaseConfig();
    if (!config) {
      setError("Supabase is not configured on the server.");
      return;
    }
    setError(null);
    setResetting(true);
    try {
      const limited = await fetch("/api/auth/login-attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      if (limited.status === 429) {
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
            src={logo}
            alt="E3"
            width={160}
            height={115}
            fetchPriority="high"
            decoding="async"
            className="mx-auto h-16 w-auto"
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
