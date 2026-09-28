/**
 * Currency and timezone option lists for the store form, derived from the
 * runtime's own ICU data (Intl.supportedValuesOf) rather than a hand-typed
 * static array — Node 18+/every evergreen browser ships this, and it stays
 * correct as ISO 4217 / the IANA tz database change, instead of drifting.
 * Safe to import from both server (Zod validation in lib/actions/stores.ts)
 * and client (the searchable comboboxes in StoreDialog.tsx) — no "use
 * client"/"use server" directive, just plain functions.
 */

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
}

export interface TimezoneOption {
  value: string;
  /** e.g. "Asia/Dubai (GMT+4)" */
  label: string;
}

let currencyCache: CurrencyOption[] | null = null;
let currencyCodeSet: Set<string> | null = null;
let timezoneCache: TimezoneOption[] | null = null;
let timezoneValueSet: Set<string> | null = null;

export function getCurrencyOptions(): CurrencyOption[] {
  if (currencyCache) return currencyCache;

  const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
  currencyCache = Intl.supportedValuesOf("currency")
    .map((code) => {
      let symbol = code;
      try {
        const parts = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: code,
          currencyDisplay: "symbol",
        }).formatToParts(0);
        symbol = parts.find((p) => p.type === "currency")?.value ?? code;
      } catch {
        // A handful of ISO 4217 codes (e.g. precious metals like XAU) have
        // no formattable symbol — fall back to the code itself.
      }
      return { code, name: displayNames.of(code) ?? code, symbol };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return currencyCache;
}

export function isValidCurrencyCode(code: string): boolean {
  if (!currencyCodeSet) {
    currencyCodeSet = new Set(Intl.supportedValuesOf("currency"));
  }
  return currencyCodeSet.has(code);
}

export function getTimezoneOptions(): TimezoneOption[] {
  if (timezoneCache) return timezoneCache;

  const now = new Date();
  timezoneCache = Intl.supportedValuesOf("timeZone")
    .map((value) => {
      let offset = "";
      try {
        offset =
          new Intl.DateTimeFormat("en-US", { timeZone: value, timeZoneName: "shortOffset" })
            .formatToParts(now)
            .find((p) => p.type === "timeZoneName")?.value ?? "";
      } catch {
        // Unreachable in practice — every value came from the same Intl API.
      }
      return { value, label: offset ? `${value} (${offset})` : value };
    })
    .sort((a, b) => a.value.localeCompare(b.value));

  return timezoneCache;
}

export function isValidTimezone(value: string): boolean {
  if (!timezoneValueSet) {
    timezoneValueSet = new Set(Intl.supportedValuesOf("timeZone"));
  }
  return timezoneValueSet.has(value);
}
