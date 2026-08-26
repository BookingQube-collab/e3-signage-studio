import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/e3-logo.png";
import { E3Button } from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSessionFn, persistSessionFn } from "@/lib/auth-functions";
import { getPublicCmsUrl } from "@/lib/cms-settings";
import { getPublicSupabaseConfigFn } from "@/lib/public-config-functions";
import {
  ensurePublicSupabaseConfig,
  getBrowserAccessToken,
  getSupabase,
  seedPublicSupabaseConfig,
} from "@/lib/supabase";

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
    return "Invalid email or password.";
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
  const [email, setEmail] = useState("rajan@e3.qa");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password to continue.");
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
      const { data, error: signError } = await getSupabase().auth.signInWithPassword({
        email,
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
    if (!email) {
      setError("Enter your email to reset your password.");
      return;
    }
    const config = await ensurePublicSupabaseConfig();
    if (!config) {
      setError("Supabase is not configured on the server.");
      return;
    }
    setError(null);
    try {
      const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${getPublicCmsUrl()}/login`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      toast.success("Password reset link sent to your email");
    } catch {
      setError("Network error. Check your connection.");
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
          <img src={logo} alt="E3" width={160} height={108} className="mx-auto h-14 w-auto" />
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl bg-background"
                placeholder="you@e3.qa"
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
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign In"}
            </E3Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => void onForgotPassword()}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
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
