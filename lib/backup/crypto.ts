import "server-only";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import zlib from "node:zlib";

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

/**
 * BACKUP_ENCRYPTION_KEY may be a human passphrase (arbitrary length/entropy)
 * rather than exactly 32 raw bytes — feeding an arbitrary string straight
 * into createCipheriv('aes-256-gcm', ...) throws "Invalid key length" unless
 * it happens to be exactly 32 bytes. scrypt derives a fixed-length key from
 * whatever passphrase is configured, and a random per-archive salt means the
 * same passphrase never derives the same key twice.
 */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, KEY_LEN);
}

function getPassphrase(): string {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("BACKUP_ENCRYPTION_KEY is not configured");
  }
  return key;
}

/**
 * Archive layout: [16-byte salt][12-byte IV][gzip+AES-256-GCM ciphertext][16-byte auth tag].
 * The tag trails the ciphertext (not a fixed header before it, despite some specs assuming
 * that) because GCM only produces the tag after the whole stream has been encrypted —
 * putting it up front would require buffering the entire archive in memory first, which
 * defeats the point of a streaming pipeline.
 */
export async function encryptArchiveFile(
  sourcePath: string,
  destPath: string,
  secretKey: string = getPassphrase()
): Promise<void> {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(secretKey, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const dest = fs.createWriteStream(destPath);
  dest.write(salt);
  dest.write(iv);

  await pipeline(fs.createReadStream(sourcePath), zlib.createGzip({ level: 9 }), cipher, dest, {
    end: false,
  });

  await new Promise<void>((resolve, reject) => {
    dest.write(cipher.getAuthTag(), (err) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    dest.end((err: unknown) => (err ? reject(err) : resolve()));
  });
}

export async function decryptArchiveFile(
  sourcePath: string,
  destPath: string,
  secretKey: string = getPassphrase()
): Promise<void> {
  const fd = await fs.promises.open(sourcePath, "r");
  try {
    const { size } = await fd.stat();
    const salt = Buffer.alloc(SALT_LEN);
    const iv = Buffer.alloc(IV_LEN);
    const tag = Buffer.alloc(TAG_LEN);

    await fd.read(salt, 0, SALT_LEN, 0);
    await fd.read(iv, 0, IV_LEN, SALT_LEN);
    await fd.read(tag, 0, TAG_LEN, size - TAG_LEN);

    const ciphertextStart = SALT_LEN + IV_LEN;
    const ciphertextEnd = size - TAG_LEN - 1;

    const key = deriveKey(secretKey, salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const source = fs.createReadStream(sourcePath, { start: ciphertextStart, end: ciphertextEnd });
    await pipeline(source, decipher, zlib.createGunzip(), fs.createWriteStream(destPath));
  } finally {
    await fd.close();
  }
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function sha256String(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
