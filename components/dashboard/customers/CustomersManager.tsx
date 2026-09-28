"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Users, RotateCcw, Pencil, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { CustomerDialog } from "./CustomerDialog";
import { deactivateCustomer, reactivateCustomer } from "@/lib/actions/customers";
import type { Customer } from "@/lib/types/domain";

export function CustomersManager({ customers }: { customers: Customer[] }) {
  const [search, setSearch] = useState("");
  const [dialogState, setDialogState] = useState<{ open: boolean; customer: Customer | null }>({
    open: false,
    customer: null,
  });
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((c) =>
      [c.full_name, c.phone, c.email].some((field) => field?.toLowerCase().includes(query))
    );
  }, [customers, search]);

  async function toggleActive(customer: Customer) {
    setPendingId(customer.id);
    try {
      if (customer.is_active) {
        await deactivateCustomer(customer.id);
        toast.success(`${customer.full_name} deactivated`);
      } else {
        await reactivateCustomer(customer.id);
        toast.success(`${customer.full_name} reactivated`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search name, phone, email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Button onClick={() => setDialogState({ open: true, customer: null })}>
          <Plus />
          New customer
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          <Users className="size-8" />
          <p className="text-sm">
            {customers.length === 0 ? "No customers registered yet." : "No customers match your search."}
          </p>
          {customers.length === 0 && (
            <p className="text-xs">Register one here, or from the &quot;Add customer&quot; control in the POS cart.</p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.full_name}</TableCell>
                  <TableCell className="font-mono text-xs">{customer.phone ?? "—"}</TableCell>
                  <TableCell className="text-xs">{customer.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={customer.is_active ? "secondary" : "outline"}>
                      {customer.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${customer.full_name}`}
                        onClick={() => setDialogState({ open: true, customer })}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={customer.is_active ? `Deactivate ${customer.full_name}` : `Reactivate ${customer.full_name}`}
                        title={customer.is_active ? "Deactivate" : "Reactivate"}
                        disabled={pendingId === customer.id}
                        onClick={() => toggleActive(customer)}
                      >
                        {customer.is_active ? (
                          <Ban className="size-3.5 text-destructive" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CustomerDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((prev) => ({ ...prev, open }))}
        customer={dialogState.customer}
      />
    </div>
  );
}
