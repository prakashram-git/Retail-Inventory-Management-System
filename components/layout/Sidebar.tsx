"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { useHelpCenter } from "@/components/help/HelpCenterContext";
import { useSessionGuard } from "@/components/auth/SessionProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { ROLE_LABEL, StatusDot, initialsFor } from "./UserMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NAV_ITEMS, matchActiveHref } from "./nav-items";
import type { UserRole } from "@/lib/types/domain";

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const { user, requestSignOut } = useSessionGuard();
  const { isOnline } = useSync();
  const { openHelp } = useHelpCenter();
  const signOutRef = useRef<HTMLButtonElement | null>(null);
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const activeHref = matchActiveHref(pathname, items);

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "touch-target flex items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t p-3">
        <button
          type="button"
          data-testid="sidebar-help"
          onClick={(e) => {
            e.preventDefault();
            openHelp();
          }}
          className="touch-target flex items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
        >
          <HelpCircle className="h-4 w-4" />
          Help &amp; Tutorials
          <kbd className="ml-auto rounded border px-1 text-[10px] text-muted-foreground">F1</kbd>
        </button>
        <div
          data-testid="sidebar-user-card"
          className="flex min-h-14 items-center gap-2 rounded-lg bg-sidebar-accent/40 p-2"
        >
          <span className="relative shrink-0">
            <Avatar>
              <AvatarFallback>{initialsFor(user.fullName, user.email)}</AvatarFallback>
            </Avatar>
            <StatusDot online={isOnline} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">
              {user.fullName ?? user.email}
            </span>
            <span className="truncate text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
          </div>
          <button
            type="button"
            ref={signOutRef}
            data-testid="sidebar-signout"
            onClick={() => void requestSignOut(signOutRef.current)}
            className="touch-target flex shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-500/10 active:scale-95 dark:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
