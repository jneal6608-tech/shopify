"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Calculator, Clapperboard, Columns3, Eye, Factory, FileText, FlaskConical, LayoutDashboard, Menu, Search,
  Settings, Shapes, Store, Swords, TrendingUp, X, Bell, Sparkles,
} from "lucide-react";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";
import { CompareTray } from "@/components/products/compare-tray";

const ICONS = { Calculator, Clapperboard, Columns3, Eye, Factory, FileText, FlaskConical, LayoutDashboard, Search, Settings, Shapes, Store, Swords, TrendingUp };

export function Shell({ children, email, unreadAlerts, hasDemo, authMode }: { children: React.ReactNode; email: string | null; unreadAlerts: number; hasDemo: boolean; authMode: string }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
              active ? "bg-accent/15 text-fg" : "text-muted hover:bg-panel-2 hover:text-fg",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-faint")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-panel/60 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">{nav}</div>
        <Footer email={email} authMode={authMode} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-panel">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">{nav}</div>
            <Footer email={email} authMode={authMode} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur">
          <button className="text-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="flex-1" />
          {hasDemo && (
            <Link href="/settings#demo" className="rounded-md border border-demo/40 bg-demo/10 px-2 py-1 text-[11px] font-medium text-demo">
              Demo data loaded — not real market data
            </Link>
          )}
          <Link href="/watchlist?tab=alerts" className="relative text-muted hover:text-fg" aria-label="Alerts">
            <Bell className="h-4.5 w-4.5" />
            {unreadAlerts > 0 && (
              <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{unreadAlerts > 99 ? "99+" : unreadAlerts}</span>
            )}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 animate-fade-in">{children}</main>
        <CompareTray />
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex h-12 items-center gap-2 px-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2"><Sparkles className="h-4 w-4 text-white" /></span>
      <span className="text-sm font-semibold tracking-tight">Dropship Intel</span>
    </Link>
  );
}

function Footer({ email, authMode }: { email: string | null; authMode: string }) {
  return (
    <div className="border-t border-border px-4 py-3 text-xs text-muted">
      <p className="truncate">{email ?? "Signed in"}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-faint">{authMode === "local" ? "Local dev auth" : "Supabase Auth"}</span>
        {authMode !== "local" && (
          <form action="/auth/signout" method="post"><button className="text-faint hover:text-fg">Sign out</button></form>
        )}
      </div>
    </div>
  );
}
