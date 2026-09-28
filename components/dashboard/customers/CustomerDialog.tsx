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
import { Checkbox } from "@/components/ui/checkbox";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import type { Customer } from "@/lib/types/domain";

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export function CustomerDialog({ open, onOpenChange, customer }: CustomerDialogProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [acceptsEmailMarketing, setAcceptsEmailMarketing] = useState(false);
  const [acceptsSmsMarketing, setAcceptsSmsMarketing] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Resets the form to the dialog's initial values whenever it opens for a
    // (possibly different) customer, matching CategoryDialog's convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFirstName(customer?.first_name ?? "");
    setLastName(customer?.last_name ?? "");
    setPhone(customer?.phone ?? "");
    setEmail(customer?.email ?? "");
    setCompany(customer?.company ?? "");
    setNotes(customer?.notes ?? "");
    setAcceptsEmailMarketing(customer?.accepts_email_marketing ?? false);
    setAcceptsSmsMarketing(customer?.accepts_sms_marketing ?? false);
  }, [open, customer]);

  function submit() {
    if (!firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    if (acceptsEmailMarketing && !email.trim()) {
      toast.error("Add an email address before enabling email marketing");
      return;
    }
    if (acceptsSmsMarketing && !phone.trim()) {
      toast.error("Add a phone number before enabling SMS marketing");
      return;
    }
    startTransition(async () => {
      try {
        const input = {
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          company: company.trim() || null,
          notes: notes.trim() || null,
          accepts_email_marketing: acceptsEmailMarketing,
          accepts_sms_marketing: acceptsSmsMarketing,
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
            {customer
              ? `Update this customer's details.${
                  customer.created_at
                    ? ` Customer since ${new Date(customer.created_at).toLocaleDateString()}.`
                    : ""
                }`
              : "Register a new customer for this store."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-first-name">First name</Label>
              <Input
                id="customer-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isPending}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-last-name">Last name</Label>
              <Input
                id="customer-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isPending}
              />
            </div>
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
            <Label htmlFor="customer-company">Company (optional)</Label>
            <Input
              id="customer-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={isPending}
              placeholder="For wholesale / corporate accounts"
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

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <Label className="text-xs text-muted-foreground">Marketing consent</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="customer-email-marketing"
                checked={acceptsEmailMarketing}
                onCheckedChange={(v) => setAcceptsEmailMarketing(v === true)}
                disabled={isPending}
              />
              <Label htmlFor="customer-email-marketing" className="text-sm font-normal">
                Accepts email marketing
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="customer-sms-marketing"
                checked={acceptsSmsMarketing}
                onCheckedChange={(v) => setAcceptsSmsMarketing(v === true)}
                disabled={isPending}
              />
              <Label htmlFor="customer-sms-marketing" className="text-sm font-normal">
                Accepts SMS marketing
              </Label>
            </div>
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
