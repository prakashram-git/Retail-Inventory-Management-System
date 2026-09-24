import { Check, X, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Access = "full" | "scoped" | "none";

interface Capability {
  label: string;
  superAdmin: Access;
  storeManager: Access;
  cashier: Access;
  note?: string;
}

const CAPABILITIES: Capability[] = [
  { label: "Point of Sale (process sales)", superAdmin: "scoped", storeManager: "scoped", cashier: "scoped", note: "Cashiers and managers are pinned to their own store; super admins can switch stores." },
  { label: "Products & categories", superAdmin: "scoped", storeManager: "scoped", cashier: "none" },
  { label: "Stock adjustments", superAdmin: "scoped", storeManager: "scoped", cashier: "none" },
  { label: "Orders & refunds", superAdmin: "scoped", storeManager: "scoped", cashier: "none" },
  { label: "Reports & analytics", superAdmin: "scoped", storeManager: "scoped", cashier: "none" },
  { label: "Store directory (create / edit / delete stores)", superAdmin: "full", storeManager: "none", cashier: "none" },
  { label: "Staff (invite / edit / reset password / delete)", superAdmin: "full", storeManager: "none", cashier: "none" },
  { label: "Appearance — mall-wide default", superAdmin: "full", storeManager: "none", cashier: "none" },
  { label: "Appearance — own store's login wallpaper", superAdmin: "full", storeManager: "scoped", cashier: "none" },
  { label: "Own account (change password, phone number)", superAdmin: "full", storeManager: "full", cashier: "full" },
];

const ACCESS_CONFIG: Record<Access, { icon: typeof Check; className: string; label: string }> = {
  full: { icon: Check, className: "text-emerald-600 dark:text-emerald-400", label: "Full access" },
  scoped: { icon: Minus, className: "text-amber-600 dark:text-amber-400", label: "Own store only" },
  none: { icon: X, className: "text-muted-foreground/50", label: "No access" },
};

function AccessCell({ access }: { access: Access }) {
  const config = ACCESS_CONFIG[access];
  const Icon = config.icon;
  return (
    <TableCell className="text-center">
      <Icon className={cn("mx-auto size-4", config.className)} aria-label={config.label} />
    </TableCell>
  );
}

export function RolesOverview() {
  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Roles & responsibilities</CardTitle>
          <CardDescription>
            Read-only reference — role assignment happens per person in the Staff tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> Full access
            </span>
            <span className="flex items-center gap-1.5">
              <Minus className="size-3.5 text-amber-600 dark:text-amber-400" /> Own store only
            </span>
            <span className="flex items-center gap-1.5">
              <X className="size-3.5 text-muted-foreground/50" /> No access
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                <TableHead className="text-center">
                  <Badge variant="default">Super admin</Badge>
                </TableHead>
                <TableHead className="text-center">
                  <Badge variant="secondary">Store manager</Badge>
                </TableHead>
                <TableHead className="text-center">
                  <Badge variant="outline">Cashier</Badge>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAPABILITIES.map((cap) => (
                <TableRow key={cap.label}>
                  <TableCell className="align-top">
                    <div className="flex flex-col">
                      <span className="font-medium">{cap.label}</span>
                      {cap.note && (
                        <span className="text-xs text-muted-foreground">{cap.note}</span>
                      )}
                    </div>
                  </TableCell>
                  <AccessCell access={cap.superAdmin} />
                  <AccessCell access={cap.storeManager} />
                  <AccessCell access={cap.cashier} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Super admin</span> — mall-wide. Manages
            every store, all staff accounts and their access, the mall&apos;s default appearance,
            and can view or operate any store&apos;s POS, inventory, orders, and reports.
          </p>
          <p>
            <span className="font-medium text-foreground">Store manager</span> — runs one store
            end-to-end: products, categories, stock, orders, refunds, reports, POS, and that
            store&apos;s own login wallpaper. Cannot see or affect other stores, and cannot manage
            staff accounts or the store directory.
          </p>
          <p>
            <span className="font-medium text-foreground">Cashier</span> — point-of-sale only, for
            their assigned store. Can sell, open/close their cash drawer, and view sister-store
            stock for a sale, but has no access to the management dashboard, inventory editing,
            reports, or other stores&apos; data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
