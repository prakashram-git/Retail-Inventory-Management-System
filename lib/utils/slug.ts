export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Pure suffix-appending logic shared by categories.ts's uniqueSlug (DB-backed,
 * one query per candidate) and the CSV bulk-import dry run (in-memory only,
 * so a preview can show the slug a row would get without a DB round trip
 * per row).
 */
export function nextAvailableSlug(root: string, taken: Set<string>): string {
  const base = root || "category";
  let candidate = base;
  let suffix = 1;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
