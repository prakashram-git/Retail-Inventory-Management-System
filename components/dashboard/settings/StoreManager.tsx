"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StoreDialog } from "./StoreDialog";
import { DeleteRowButton } from "./DeleteRowButton";
import { deleteStore } from "@/lib/actions/stores";
import type { StoreDirectoryEntry } from "@/lib/types/domain";

export function StoreManager({ stores }: { stores: StoreDirectoryEntry[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedStore = stores.find((store) => store.id === selectedId) ?? null;

  function openCreate() {
    setSelectedId(null);
    setDialogOpen(true);
  }

  function openEdit(id: string) {
    setSelectedId(id);
    setDialogOpen(true);
  }

  return (
    <>
      <Card size="sm">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Store directory</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus />
            New store
          </Button>
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No stores yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Unit / Floor</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Tax model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((store) => (
                  <TableRow
                    key={store.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(store.id)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{store.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{store.code}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {store.unit_number}
                      {store.floor_number ? ` · Floor ${store.floor_number}` : ""}
                    </TableCell>
                    <TableCell className="font-mono">{store.currency}</TableCell>
                    <TableCell className="font-mono text-xs">{store.timezone}</TableCell>
                    <TableCell className="capitalize">{store.tax_model}</TableCell>
                    <TableCell>
                      <Badge variant={store.is_active ? "secondary" : "outline"}>
                        {store.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DeleteRowButton
                        itemLabel={store.name}
                        onConfirm={() => deleteStore(store.id)}
                        softDeleteNote="If it has products, orders, or staff assigned, it'll be deactivated instead of removed."
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StoreDialog open={dialogOpen} onOpenChange={setDialogOpen} store={selectedStore} />
    </>
  );
}
