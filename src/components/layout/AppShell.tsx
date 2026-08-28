import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  ListVideo,
  MapPin,
  Megaphone,
  Menu,
  Monitor,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useCmsLogoSrc } from "@/components/branding/CmsBranding";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { clearSessionFn } from "@/lib/auth-functions";
import type { CmsProfile } from "@/lib/auth-types";
import { hasPermission } from "@/lib/rbac";
import { ensurePublicSupabaseConfig, getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { UI_ROLE, type AppPermission } from "@e3/shared-types";

const NAV: ReadonlyArray<{
  label: string;
  to:
    | "/dashboard"
    | "/locations"
    | "/screens"
    | "/media"
    | "/playlists"
    | "/layouts"
    | "/campaigns"
    | "/schedule"
    | "/reports"
    | "/users"
    | "/settings";
  icon: typeof LayoutDashboard;
  permission: AppPermission;
}> = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { label: "Locations", to: "/locations", icon: MapPin, permission: "locations.view" },
  { label: "Screens", to: "/screens", icon: Monitor, permission: "screens.view" },
  { label: "Media", to: "/media", icon: Image, permission: "media.view" },
  { label: "Playlists", to: "/playlists", icon: ListVideo, permission: "playlists.view" },
  { label: "Layouts", to: "/layouts", icon: LayoutTemplate, permission: "layouts.view" },
  { label: "Campaigns", to: "/campaigns", icon: Megaphone, permission: "campaigns.view" },
  { label: "Schedule", to: "/schedule", icon: CalendarClock, permission: "schedule.view" },
  { label: "Reports", to: "/reports", icon: BarChart3, permission: "reports.view" },
  { label: "Users", to: "/users", icon: Users, permission: "users.view" },
  { label: "Settings", to: "/settings", icon: Settings, permission: "settings.view" },
];

function initialsFor(name: string): string {
  return (
    name
      .split(" ")
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const logoSrc = useCmsLogoSrc();
  return (
    <Link to="/dashboard" preload="intent" className="flex items-center gap-3 px-2 py-1">
      <img
        src={logoSrc}
        alt="E3"
        width={40}
        height={29}
        fetchPriority="high"
        decoding="async"
        className="h-7 w-auto shrink-0 object-contain"
      />
      {!collapsed ? (
        <span className="font-display min-w-0 truncate text-sm font-semibold uppercase tracking-[0.16em]">
          Digital Signage
        </span>
      ) : null}
    </Link>
  );
}

function NavList({
  collapsed,
  onNavigate,
  profile,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  profile: CmsProfile | null;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = NAV.filter(
    (item) => profile !== null && hasPermission(profile.role, item.permission),
  );

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {items.map(({ label, to, icon: Icon }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            to={to}
            preload="intent"
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "e3-gradient text-white shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {!collapsed ? <span className="min-w-0 truncate">{label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  profile,
  fallbackEmail,
}: {
  children: ReactNode;
  profile: CmsProfile | null;
  fallbackEmail: string | null;
}) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const name = profile?.name ?? fallbackEmail ?? "Signed in";
  const roleLabel = profile ? UI_ROLE[profile.role] : "No profile";
  const initials = initialsFor(profile?.name ?? fallbackEmail ?? "?");
  const showSettings = profile !== null && hasPermission(profile.role, "settings.view");

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await ensurePublicSupabaseConfig();
      await getSupabase().auth.signOut();
    } catch {
      // still clear server cookies
    }
    try {
      await clearSessionFn();
    } catch {
      // ignore
    }
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-3">
          <Brand collapsed={collapsed} />
        </div>
        <NavList collapsed={collapsed} profile={profile} />
        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed ? "Collapse" : null}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-border lg:hidden"
              >
                <Menu className="size-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-16 items-center border-b border-sidebar-border px-3">
                <Brand />
              </div>
              <NavList onNavigate={() => setMobileOpen(false)} profile={profile} />
            </SheetContent>
          </Sheet>

          <div className="hidden min-w-0 flex-1 items-center md:flex">
            <div className="relative w-full max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search screens, media, campaigns…"
                aria-label="Global search"
                className="h-10 rounded-xl border-border bg-card pl-9"
              />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 md:flex-none">
            <span className="font-display hidden text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:inline">
              E3 Digital Signage
            </span>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User menu"
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar className="size-9 border border-border">
                    <AvatarFallback className="bg-secondary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {showSettings ? (
                  <DropdownMenuItem asChild>
                    <Link to="/settings" preload="intent">Settings</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => void signOut()} disabled={signingOut}>
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
