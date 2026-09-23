const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND"]);
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "KWD", "OMR"]);

export function getCurrencyDecimals(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export function formatCurrency(
  amount: number | string,
  currency: string = "USD",
  locale: string = "en-US"
): string {
  const numericAmount = typeof amount === "string" ? Number(amount) : amount;
  const decimals = getCurrencyDecimals(currency);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}

export function getQuickTenderDenominations(
  currency: string,
  total: number
): number[] {
  const decimals = getCurrencyDecimals(currency);
  const unit = 10 ** -decimals;

  if (!Number.isFinite(total) || total <= 0) return [];

  // Standard note/bill steps within a single order of magnitude (1x/2x/5x),
  // scaled up to whatever magnitude the total falls in.
  const magnitude = 10 ** Math.floor(Math.log10(total));
  const roundSteps = [1, 2, 5].flatMap((step) => [
    step * magnitude,
    step * magnitude * 10,
  ]);

  // Exact tender rounded up to the currency's smallest denomination, plus
  // the next few round-number notes above the total.
  const exact = Math.ceil(total / unit) * unit;
  const roundUps = roundSteps
    .map((value) => Math.ceil(value / unit) * unit)
    .filter((value) => value > exact);

  const denominations = new Set<number>([exact, ...roundUps]);

  return Array.from(denominations)
    .sort((a, b) => a - b)
    .slice(0, 4)
    .map((value) => Number(value.toFixed(decimals)));
}
