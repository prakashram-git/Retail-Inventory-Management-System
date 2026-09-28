"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { User, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createCustomer, searchCustomers, type CustomerSummary } from "@/lib/actions/customers";

interface CustomerPickerProps {
  customer: CustomerSummary | null;
  onChange: (customer: CustomerSummary | null) => void;
}

export function CustomerPicker({ customer, onChange }: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        setResults(await searchCustomers(query));
      } catch {
        // Search is a convenience, not a required step — fail quietly.
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function resetAndClose() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setShowRegisterForm(false);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
  }

  function select(next: CustomerSummary) {
    onChange(next);
    resetAndClose();
  }

  async function registerAndSelect() {
    if (!newName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setIsRegistering(true);
    try {
      const created = await createCustomer({
        full_name: newName.trim(),
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
      });
      toast.success(`${created.full_name} registered`);
      select(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not register customer";
      if (message.includes("already exists") && newPhone.trim()) {
        // Dead end otherwise: a cashier mid-sale who mistypes a "new"
        // customer's phone that's already on file would just hit an error
        // and have to redo the search by hand. Drop back into search mode
        // with that phone pre-filled instead, so the existing match is one
        // tap away.
        toast.error("That phone number is already registered — showing the match below.");
        setShowRegisterForm(false);
        setQuery(newPhone.trim());
      } else {
        toast.error(message);
      }
    } finally {
      setIsRegistering(false);
    }
  }

  if (customer) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <User className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{customer.full_name}</span>
          {customer.phone && <span className="shrink-0 text-xs text-muted-foreground">{customer.phone}</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Remove customer from sale"
          className="touch-target flex shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* touch-target: this is a primary entry point a cashier reaches for
          mid-sale on a touchscreen, not a repeated per-line control — same
          reachability bar as the header icon buttons and Charge, not the
          cart's dense +/- qty steppers. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-target flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <UserPlus className="size-4" />
        Add customer
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add customer to sale</DialogTitle>
            <DialogDescription>Search an existing customer, or register a new one.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              placeholder="Search by name, phone, or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            {query.trim() && (
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {isSearching && <p className="px-1 py-2 text-sm text-muted-foreground">Searching…</p>}
                {!isSearching && results.length === 0 && (
                  <p className="px-1 py-2 text-sm text-muted-foreground">No matches.</p>
                )}
                {results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => select(result)}
                    className="flex flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{result.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[result.phone, result.email].filter(Boolean).join(" · ") || "No contact info"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!showRegisterForm ? (
              <Button variant="outline" size="sm" onClick={() => setShowRegisterForm(true)} className="self-start">
                <UserPlus className="size-3.5" />
                Register new customer
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-customer-name">Name</Label>
                  <Input
                    id="new-customer-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isRegistering}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-customer-phone">Phone (optional)</Label>
                  <Input
                    id="new-customer-phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    disabled={isRegistering}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-customer-email">Email (optional)</Label>
                  <Input
                    id="new-customer-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={isRegistering}
                  />
                </div>
                <Button onClick={registerAndSelect} disabled={isRegistering} className="mt-1">
                  {isRegistering ? "Registering..." : "Register & add to sale"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
