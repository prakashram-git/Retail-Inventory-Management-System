"use client";

import Link from "next/link";
import { BarChart3, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StoreFeatures } from "@/lib/profiles/types";

/**
 * `show_dashboard: false` (the Lite Register profile): no analytics were even queried for
 * this render, so this renders only what the profile still allows — normally just POS.
 */
export function LiteLaunchpad({ storeName, features }: { storeName: string; features: StoreFeatures }) {
  const links = [
    features.allow_pos_shortcut && { href: "/pos", label: "Open POS", icon: ShoppingCart },
    features.allow_reports_shortcut && { href: "/dashboard/reports", label: "View reports", icon: BarChart3 },
  ].filter((l): l is { href: string; label: string; icon: typeof ShoppingCart } => !!l);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 p-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">{storeName}</h1>
        <p className="text-sm text-muted-foreground">This terminal is set to Lite Register mode.</p>
      </div>
      <Card className="w-full max-w-xs">
        <CardContent className="flex flex-col gap-2 py-4">
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shortcuts are enabled for this profile.</p>
          ) : (
            links.map((l) => (
              <Button key={l.href} size="lg" nativeButton={false} render={<Link href={l.href} />}>
                <l.icon />
                {l.label}
              </Button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
