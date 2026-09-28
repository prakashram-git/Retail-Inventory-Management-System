"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createStore, updateStore } from "@/lib/actions/stores";
import { getCurrencyOptions, getTimezoneOptions } from "@/lib/utils/regions";
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
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StoreDirectoryEntry } from "@/lib/types/domain";

interface StoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: StoreDirectoryEntry | null;
}

export function StoreDialog({ open, onOpenChange, store }: StoreDialogProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [floorNumber, setFloorNumber] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [locale, setLocale] = useState("en-US");
  const [timezone, setTimezone] = useState("UTC");
  const [taxModel, setTaxModel] = useState<"inclusive" | "exclusive">("exclusive");
  const [isActive, setIsActive] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Built once per mount from the runtime's own ICU data (see
  // lib/utils/regions.ts) — not hand-maintained lists that can drift or typo.
  const currencyOptions = useMemo(
    () =>
      getCurrencyOptions().map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.name}`,
        keywords: [c.name, c.symbol],
      })),
    []
  );
  const timezoneOptions = useMemo(
    () => getTimezoneOptions().map((tz) => ({ value: tz.value, label: tz.label })),
    []
  );
  const selectedCurrency = getCurrencyOptions().find((c) => c.code === currency);

  useEffect(() => {
    if (!open) return;
    // Resets the form to the dialog's initial values whenever it opens for
    // a (possibly different) store, rather than tracking each field back to
    // props individually.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(store?.name ?? "");
    setCode(store?.code ?? "");
    setUnitNumber(store?.unit_number ?? "");
    setFloorNumber(store?.floor_number ?? "");
    setCurrency(store?.currency ?? "USD");
    setLocale(store?.locale ?? "en-US");
    setTimezone(store?.timezone ?? "UTC");
    setTaxModel(store?.tax_model ?? "exclusive");
    setIsActive(store?.is_active ?? true);
  }, [open, store]);

  function submit() {
    const input = {
      name,
      code,
      unit_number: unitNumber,
      floor_number: floorNumber || null,
      currency,
      locale,
      timezone,
      tax_model: taxModel,
      is_active: isActive,
    };

    startTransition(async () => {
      try {
        if (store) {
          await updateStore(store.id, input);
          toast.success("Store updated");
        } else {
          await createStore(input);
          toast.success("Store created");
        }
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{store ? "Edit store" : "New store"}</DialogTitle>
          <DialogDescription>
            {store
              ? "Update this store's unit details and regional settings."
              : "Onboard a new store unit into the mall."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="store-name">Store name</Label>
            <Input
              id="store-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="store-code">Store code</Label>
            <Input
              id="store-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isPending}
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="store-unit">Unit number</Label>
            <Input
              id="store-unit"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="store-floor">Floor</Label>
            <Input
              id="store-floor"
              value={floorNumber}
              onChange={(e) => setFloorNumber(e.target.value)}
              disabled={isPending}
              placeholder="Optional"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Tax model</Label>
            <Select value={taxModel} onValueChange={(value) => setTaxModel(value as "inclusive" | "exclusive")}>
              <SelectTrigger disabled={isPending} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusive">Exclusive (added at checkout)</SelectItem>
                <SelectItem value="inclusive">Inclusive (baked into price)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="store-currency">Currency</Label>
            <Combobox
              id="store-currency"
              options={currencyOptions}
              value={currency}
              onChange={setCurrency}
              disabled={isPending}
              placeholder="Select a currency"
              searchPlaceholder="Search code or name..."
              emptyText="No matching currency."
              renderValue={() => {
                if (!selectedCurrency) return currency;
                // Some ISO 4217 codes (AED, SAR, ...) have no distinct
                // glyph, so Intl's own "symbol" falls back to the code
                // itself — showing "AED (AED)" would just be noise.
                const symbolPart =
                  selectedCurrency.symbol !== selectedCurrency.code ? ` (${selectedCurrency.symbol})` : "";
                return `${selectedCurrency.code}${symbolPart} — ${selectedCurrency.name}`;
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="store-locale">Locale</Label>
            <Input
              id="store-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              disabled={isPending}
              className="font-mono"
              placeholder="en-US"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="store-timezone">Timezone</Label>
            <Combobox
              id="store-timezone"
              options={timezoneOptions}
              value={timezone}
              onChange={setTimezone}
              disabled={isPending}
              placeholder="Select a timezone"
              searchPlaceholder="Search city or region..."
              emptyText="No matching timezone."
            />
          </div>

          <div className="col-span-2 flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="store-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive stores are hidden from the active-store switcher.
              </p>
            </div>
            <Switch id="store-active" checked={isActive} onCheckedChange={setIsActive} disabled={isPending} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              isPending || !name.trim() || !code.trim() || !unitNumber.trim() || !timezone.trim()
            }
          >
            {isPending ? "Saving..." : store ? "Save changes" : "Create store"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
