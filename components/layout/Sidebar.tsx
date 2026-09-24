"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NAV_ITEMS, matchActiveHref } from "./nav-items";
import type { UserRole } from "@/lib/types/domain";

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "Super admin",
  store_manager: "Store manager",
  cashier: "Cashier",
  ui_designer: "UI designer",
};

interface SidebarProfile {
  full_name: string | null;
  email: string;
}

function initialsFor(profile: SidebarProfile): string {
  const source = profile.full_name?.trim() || profile.email;
  return source.slice(0, 2).toUpperCase();
}

export function Sidebar({ role, profile }: { role: UserRole; profile: SidebarProfile }) {
  const pathname = usePathname();
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
        <div className="flex items-center gap-2 px-1">
          <Avatar size="sm">
            <AvatarFallback>{initialsFor(profile)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">
              {profile.full_name ?? profile.email}
            </span>
            <span className="truncate text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="touch-target flex w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
