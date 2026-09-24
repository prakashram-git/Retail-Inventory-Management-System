"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Image as ImageIcon, Users, KeyRound, ShieldCheck, DatabaseBackup, LayoutPanelTop, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/domain";

const SETTINGS_TABS = [
  { href: "/dashboard/settings/stores", label: "Stores", icon: Store, roles: ["super_admin"] },
  {
    href: "/dashboard/settings/appearance",
    label: "Appearance",
    icon: ImageIcon,
    roles: ["super_admin", "store_manager", "ui_designer"],
  },
  {
    href: "/dashboard/settings/layout-builder",
    label: "Layout Builder",
    icon: LayoutPanelTop,
    roles: ["super_admin", "ui_designer"],
  },
  { href: "/dashboard/settings/users", label: "Staff", icon: Users, roles: ["super_admin"] },
  {
    href: "/dashboard/settings/roles",
    label: "Roles",
    icon: ShieldCheck,
    roles: ["super_admin", "store_manager"],
  },
  {
    href: "/dashboard/settings/account",
    label: "Account",
    icon: KeyRound,
    roles: ["super_admin", "store_manager", "ui_designer"],
  },
  {
    href: "/dashboard/settings/backup",
    label: "Backup",
    icon: DatabaseBackup,
    roles: ["super_admin"],
  },
  { href: "/dashboard/settings/help", label: "Help", icon: LifeBuoy, roles: ["super_admin"] },
] as const;

export function SettingsTabs({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const tabs = SETTINGS_TABS.filter((tab) => (tab.roles as readonly UserRole[]).includes(role));

  return (
    <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
