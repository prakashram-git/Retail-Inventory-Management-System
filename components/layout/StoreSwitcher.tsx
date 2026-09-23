"use client";

import { Store as StoreIcon, Check, ChevronsUpDown } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function StoreSwitcher() {
  const { storeId, storeName, stores, canSwitchStore, switchStore, isSwitching } =
    useStore();

  if (!canSwitchStore) {
    return (
      <div className="flex items-center gap-2 px-2 text-sm font-medium">
        <StoreIcon className="h-4 w-4 text-muted-foreground" />
        {storeName}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="touch-target gap-2"
            disabled={isSwitching}
          >
            <StoreIcon className="h-4 w-4" />
            <span className="max-w-40 truncate">{storeName}</span>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      />

      <DropdownMenuContent align="start">
        {stores.map((store) => (
          <DropdownMenuItem
            key={store.id}
            className="touch-target"
            onSelect={() => switchStore(store.id)}
          >
            {store.name}
            {store.id === storeId && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
