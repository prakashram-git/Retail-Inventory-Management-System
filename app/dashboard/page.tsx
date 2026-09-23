import Link from "next/link";
import { FolderTree, Boxes } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manage your store&apos;s catalog and inventory.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/dashboard/categories">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <FolderTree className="mb-2 h-5 w-5 text-muted-foreground" />
              <CardTitle>Categories</CardTitle>
              <CardDescription>
                Build parent and subcategory hierarchies for your catalog.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/dashboard/inventory">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <Boxes className="mb-2 h-5 w-5 text-muted-foreground" />
              <CardTitle>Products & Inventory</CardTitle>
              <CardDescription>
                Track stock, pricing, and margins across every SKU.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
