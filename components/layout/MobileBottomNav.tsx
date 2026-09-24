"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, LogOut, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionGuard } from "@/components/auth/SessionProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NAV_ITEMS, matchActiveHref } from "./nav-items";
import { ROLE_LABEL, StatusDot, initialsFor } from "./UserMenu";
import type { UserRole } from "@/lib/types/domain";

export function MobileBottomNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const activeHref = matchActiveHref(pathname, items);
  const { user, lock, requestSignOut } = useSessionGuard();
  const { storeName } = useStore();
  const { isOnline } = useSync();
  const [open, setOpen] = useState(false);
  const profileRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "touch-target flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          ref={profileRef}
          data-testid="mobile-profile-btn"
          onClick={() => setOpen(true)}
          className="touch-target flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-xs font-medium text-muted-foreground"
        >
          <UserCircle className="h-5 w-5" />
          Profile
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle className="sr-only">Profile</SheetTitle>
            <SheetDescription className="sr-only">Account actions</SheetDescription>
            <div className="flex items-center gap-3">
              <span className="relative">
                <Avatar size="lg">
                  <AvatarFallback>{initialsFor(user.fullName, user.email)}</AvatarFallback>
                </Avatar>
                <StatusDot online={isOnline} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.fullName ?? user.email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
                  <Badge variant="outline" className="max-w-40 truncate">{storeName}</Badge>
                </div>
              </div>
            </div>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4">
            <Button
              variant="outline"
              className="touch-target justify-start"
              onClick={() => {
                setOpen(false);
                lock();
              }}
            >
              <Lock />
              Lock Terminal / Switch PIN
            </Button>
            <Button
              variant="outline"
              className="touch-target justify-start border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
              onClick={() => {
                setOpen(false);
                void requestSignOut(profileRef.current);
              }}
            >
              <LogOut />
              Sign Out...
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
