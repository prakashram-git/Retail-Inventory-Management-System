import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingCart,
  FolderTree,
  Boxes,
  Receipt,
  BarChart3,
  Settings,
} from "lucide-react";
import type { UserRole } from "@/lib/types/domain";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["super_admin", "store_manager", "ui_designer"],
  },
  {
    href: "/dashboard/categories",
    label: "Categories",
    icon: FolderTree,
    roles: ["super_admin", "store_manager"],
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    icon: Boxes,
    roles: ["super_admin", "store_manager"],
  },
  {
    href: "/dashboard/orders",
    label: "Orders",
    icon: Receipt,
    roles: ["super_admin", "store_manager"],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["super_admin", "store_manager"],
  },
  {
    href: "/pos",
    label: "POS",
    icon: ShoppingCart,
    roles: ["super_admin", "store_manager", "cashier"],
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    roles: ["super_admin", "store_manager", "ui_designer"],
  },
];

/**
 * Picks the single nav item whose href best matches the current path, so a
 * parent route like "/dashboard" doesn't also light up on "/dashboard/inventory".
 */
export function matchActiveHref(pathname: string, items: NavItem[]): string | undefined {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
