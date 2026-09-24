import "server-only";

/** Field names that must never leave the database in a backup file, regardless of table. */
const SECRET_KEY_PATTERN = /password|secret|token|pin_hash|api_key/i;

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email ?? null;
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const visible = user.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

/**
 * Redacts a single record before it's written to a backup file. Generic
 * secret-shaped keys are dropped entirely; email/phone are masked rather
 * than dropped so the backup stays useful for support/debugging without
 * exposing PII at rest.
 */
export function redactRecord<T extends Record<string, unknown>>(record: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = null;
      continue;
    }
    if (key === "email" && typeof value === "string") {
      out[key] = maskEmail(value);
      continue;
    }
    if (key === "phone" && typeof value === "string") {
      out[key] = maskPhone(value);
      continue;
    }
    out[key] = value;
  }
  return out as T;
}
