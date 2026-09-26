"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateTerminalLockSettings } from "@/lib/actions/terminalLockSettings";
import type { TerminalLockSettings } from "@/lib/terminal-lock/settings";

const TIMEOUT_PRESETS = [
  { label: "1 minute", seconds: 60 },
  { label: "2 minutes", seconds: 120 },
  { label: "5 minutes", seconds: 300 },
  { label: "10 minutes", seconds: 600 },
  { label: "15 minutes (PCI maximum)", seconds: 900 },
];

interface TerminalLockSettingsCardProps {
  storeId: string;
  storeName: string;
  initialSettings: TerminalLockSettings;
}

export function TerminalLockSettingsCard({
  storeId,
  storeName,
  initialSettings,
}: TerminalLockSettingsCardProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await updateTerminalLockSettings(storeId, settings);
        toast.success("Terminal lock settings updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Terminal Lock — {storeName}</CardTitle>
        <CardDescription>
          Controls how POS terminals in this store lock. PCI DSS v4.0 8.2.8 requires an
          inactivity timeout of 15 minutes or less.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lock-timeout">Inactivity timeout</Label>
          <select
            id="lock-timeout"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={settings.inactivity_timeout_seconds}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                inactivity_timeout_seconds: Number(e.target.value),
              }))
            }
            disabled={isPending}
          >
            {TIMEOUT_PRESETS.map((preset) => (
              <option key={preset.seconds} value={preset.seconds}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div className="flex flex-col">
            <Label htmlFor="lock-on-order">Lock on order completion</Label>
            <p className="text-xs text-muted-foreground">
              Locks the terminal immediately after a sale finishes.
            </p>
          </div>
          <Switch
            id="lock-on-order"
            checked={settings.lock_on_order_complete}
            onCheckedChange={(checked) =>
              setSettings((s) => ({ ...s, lock_on_order_complete: checked }))
            }
            disabled={isPending}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div className="flex flex-col">
            <Label htmlFor="lock-on-drawer">Lock on cash drawer close</Label>
            <p className="text-xs text-muted-foreground">
              Locks the terminal immediately after a shift&rsquo;s cash drawer is closed.
            </p>
          </div>
          <Switch
            id="lock-on-drawer"
            checked={settings.lock_on_drawer_close}
            onCheckedChange={(checked) =>
              setSettings((s) => ({ ...s, lock_on_drawer_close: checked }))
            }
            disabled={isPending}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
