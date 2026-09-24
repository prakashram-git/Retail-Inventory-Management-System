import Link from "next/link";
import { LogOut, Palette } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { StoreSwitcher } from "./StoreSwitcher";
import { ConnectionBadge } from "./ConnectionBadge";
import { ThemeToggle } from "./ThemeToggle";
import { HelpButton } from "@/components/help/HelpButton";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/types/domain";

export function Header({ role }: { role: UserRole }) {
  const canCustomizeLayout = role === "super_admin" || role === "ui_designer";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-3">
      <StoreSwitcher />
      <div className="flex items-center gap-2">
        {canCustomizeLayout && (
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex"
            data-tour="header-customize-layout"
            nativeButton={false}
            render={<Link href="/dashboard/settings/layout-builder" />}
          >
            <Palette />
            Customize layout
          </Button>
        )}
        <ConnectionBadge />
        <HelpButton />
        <ThemeToggle />
        <form action={logout} className="md:hidden">
          <button
            type="submit"
            aria-label="Log out"
            className="touch-target flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </div>
    </header>
  );
}
