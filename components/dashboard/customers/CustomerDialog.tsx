"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import type { Customer } from "@/lib/types/domain";

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export function CustomerDialog({ open, onOpenChange, customer }: CustomerDialogProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Resets the form to the dialog's initial values whenever it opens for a
    // (possibly different) customer, matching CategoryDialog's convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullName(customer?.full_name ?? "");
    setPhone(customer?.phone ?? "");
    setEmail(customer?.email ?? "");
    setNotes(customer?.notes ?? "");
  }, [open, customer]);

  function submit() {
    if (!fullName.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      try {
        const input = {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        };
        if (customer) {
          await updateCustomer(customer.id, input);
          toast.success("Customer updated");
        } else {
          await createCustomer(input);
          toast.success("Customer registered");
        }
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>
            {customer ? "Update this customer's details." : "Register a new customer for this store."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-name">Name</Label>
            <Input
              id="customer-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-phone">Phone</Label>
            <Input
              id="customer-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-notes">Notes</Label>
            <Textarea
              id="customer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              placeholder="Preferences, allergies, anything worth remembering"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Saving..." : customer ? "Save changes" : "Register customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
