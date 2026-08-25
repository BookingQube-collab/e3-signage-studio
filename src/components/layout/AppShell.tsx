import { Link, useRouterState } from "@tanstack/react-router";
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

import logo from "@/assets/e3-logo.png";
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
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Locations", to: "/locations", icon: MapPin },
  { label: "Screens", to: "/screens", icon: Monitor },
  { label: "Media", to: "/media", icon: Image },
  { label: "Playlists", to: "/playlists", icon: ListVideo },
  { label: "Layouts", to: "/layouts", icon: LayoutTemplate },
  { label: "Campaigns", to: "/campaigns", icon: Megaphone },
  { label: "Schedule", to: "/schedule", icon: CalendarClock },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Users", to: "/users", icon: Users },
  { label: "Settings", to: "/settings", icon: Settings },
] as const;

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-3 px-2 py-1">
      <img src={logo} alt="E3" width={40} height={27} className="h-7 w-auto shrink-0" />
      {!collapsed ? (
        <span className="font-display min-w-0 truncate text-sm font-semibold uppercase tracking-[0.16em]">
          Digital Signage
        </span>
      ) : null}
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {NAV.map(({ label, to, icon: Icon }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            to={to}
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

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-3">
          <Brand collapsed={collapsed} />
        </div>
        <NavList collapsed={collapsed} />
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
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
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
              <NavList onNavigate={() => setMobileOpen(false)} />
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

          <div className="flex flex-1 items-center justify-end gap-3 md:flex-none">
            <span className="font-display hidden text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:inline">
              E3 Digital Signage
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User menu"
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar className="size-9 border border-border">
                    <AvatarFallback className="bg-secondary text-xs font-semibold">RP</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">Rajan Pathak</p>
                  <p className="text-xs text-muted-foreground">Super Admin</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/login">Sign out</Link>
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
