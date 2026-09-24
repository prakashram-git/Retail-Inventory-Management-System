import "server-only";
import fs from "node:fs";
import path from "node:path";
import { currentDir } from "./paths";

/** Per-file promise chain — every operation on a given entity awaits the previous one, so
 * concurrent callers (a snapshot job and an inline CDC update, say) never interleave writes
 * to the same file or race on the .tmp-then-rename swap. */
const fileLocks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  fileLocks.set(
    key,
    next.catch(() => undefined)
  );
  return next;
}

function jsonPath(entityName: string): string {
  return path.join(currentDir(), `${entityName}.json`);
}

function jsonlPath(entityName: string): string {
  return path.join(currentDir(), `${entityName}.jsonl`);
}

export function readJsonEntity<T = unknown>(entityName: string): T[] {
  const file = jsonPath(entityName);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf8").trim();
  return raw ? (JSON.parse(raw) as T[]) : [];
}

export function readJsonlEntity<T = unknown>(entityName: string): T[] {
  const file = jsonlPath(entityName);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/** Writes the whole dimension-entity array atomically: write to a .tmp sibling, then
 * rename over the real file, so a crash mid-write never leaves a truncated/corrupt file. */
export function writeJsonEntity(entityName: string, data: unknown[]): Promise<void> {
  return withLock(`json:${entityName}`, async () => {
    const file = jsonPath(entityName);
    const tmp = `${file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.promises.rename(tmp, file);
  });
}

/** O(1) append for high-volume ledgers — never reads the existing file. */
export function appendJsonlEntity(entityName: string, record: unknown): Promise<void> {
  return withLock(`jsonl:${entityName}`, async () => {
    const file = jsonlPath(entityName);
    await fs.promises.appendFile(file, `${JSON.stringify(record)}\n`);
  });
}

export function truncateJsonlEntity(entityName: string): Promise<void> {
  return withLock(`jsonl:${entityName}`, async () => {
    await fs.promises.writeFile(jsonlPath(entityName), "");
  });
}

interface Identifiable {
  id: string;
  updated_at?: string;
}

/**
 * Upserts/deletes a single record into a dimension entity's JSON file, but only if it's not
 * stale — a CDC event that arrives out of order (flaky network, retried webhook) must not
 * overwrite a newer version already on disk with older data.
 */
export function updateDimensionEntityInline(
  entityName: string,
  payload: Identifiable,
  deleted = false
): Promise<{ applied: boolean }> {
  return withLock(`json:${entityName}`, async () => {
    const file = jsonPath(entityName);
    const existing = fs.existsSync(file)
      ? (JSON.parse((await fs.promises.readFile(file, "utf8")) || "[]") as Identifiable[])
      : [];

    const currentIndex = existing.findIndex((row) => row.id === payload.id);
    const current = currentIndex >= 0 ? existing[currentIndex] : undefined;

    if (current?.updated_at && payload.updated_at && payload.updated_at < current.updated_at) {
      return { applied: false };
    }

    let next: Identifiable[];
    if (deleted) {
      next = existing.filter((row) => row.id !== payload.id);
    } else if (currentIndex >= 0) {
      next = [...existing];
      next[currentIndex] = payload;
    } else {
      next = [...existing, payload];
    }

    const tmp = `${file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(next, null, 2));
    await fs.promises.rename(tmp, file);
    return { applied: true };
  });
}
