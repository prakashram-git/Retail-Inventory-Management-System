import Link from "next/link";
import { Palette } from "lucide-react";
import { UserMenu } from "./UserMenu";
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
        <UserMenu />
      </div>
    </header>
  );
}
