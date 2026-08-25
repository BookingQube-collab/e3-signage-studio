import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/e3-logo.png";
import { E3Button } from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("rajan@e3.qa");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setError(null);
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      toast.success("Signed in");
      navigate({ to: "/dashboard" });
    }, 700);
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
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
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
                onClick={() => toast.info("Password reset link sent to your email")}
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
