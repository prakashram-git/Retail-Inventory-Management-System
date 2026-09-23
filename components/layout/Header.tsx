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
      </div>
    </header>
  );
}
