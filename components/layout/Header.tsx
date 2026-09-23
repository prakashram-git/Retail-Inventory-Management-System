import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { StoreSwitcher } from "./StoreSwitcher";
import { ConnectionBadge } from "./ConnectionBadge";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-3">
      <StoreSwitcher />
      <div className="flex items-center gap-2">
        <ConnectionBadge />
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
