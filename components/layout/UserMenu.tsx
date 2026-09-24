"use client";

import { useRef } from "react";
import { Check, Lock, LogOut, Store as StoreIcon } from "lucide-react";
import { useSessionGuard } from "@/components/auth/SessionProvider";
import { useStore } from "@/components/providers/StoreProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/domain";

export const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: "Super admin",
  store_manager: "Store manager",
  cashier: "Cashier",
  ui_designer: "UI designer",
};

export function initialsFor(name: string | null, email: string): string {
  return (name?.trim() || email).slice(0, 2).toUpperCase();
}

/** Green (online) / amber (offline) presence dot for an avatar. */
export function StatusDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-background",
        online ? "bg-emerald-500" : "bg-amber-500",
        className
      )}
    />
  );
}

export function UserMenu() {
  const { user, unitNumber, lock, requestSignOut } = useSessionGuard();
  const { storeName, stores, storeId, canSwitchStore, switchStore } = useStore();
  const { isOnline } = useSync();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const name = user.fullName ?? user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        data-testid="user-menu-trigger"
        aria-label={`Account menu for ${name}`}
        className="touch-target flex items-center gap-2 rounded-full p-1 pr-1 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:pr-3"
      >
        <span className="relative">
          <Avatar>
            <AvatarFallback>{initialsFor(user.fullName, user.email)}</AvatarFallback>
          </Avatar>
          <StatusDot online={isOnline} />
        </span>
        <span
          className={cn(
            "hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline",
            isOnline
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          )}
        >
          {isOnline ? "Online" : "Offline"}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="flex flex-col gap-1.5 px-2 py-2">
          <p className="truncate text-sm font-semibold">{name}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
            <Badge variant="outline" className="max-w-40 gap-1 truncate">
              <StoreIcon className="size-3" />
              {storeName}
              {unitNumber ? ` · Unit ${unitNumber}` : ""}
            </Badge>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onClick={lock}>
          <Lock />
          Lock Terminal / Switch PIN
        </DropdownMenuItem>
        {canSwitchStore && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="min-h-11">
              <StoreIcon />
              Switch Store
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {stores.map((store) => (
                <DropdownMenuItem key={store.id} className="min-h-11" onClick={() => switchStore(store.id)}>
                  {store.id === storeId ? <Check /> : <span className="size-4" />}
                  {store.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="min-h-11 font-medium text-red-600 focus:text-red-600"
          onClick={() => void requestSignOut(triggerRef.current)}
        >
          <LogOut />
          Sign Out...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
