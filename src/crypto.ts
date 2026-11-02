import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** Derive independent subkeys (db / field) from the master key. */
export const subkey = (master: Buffer, label: string): Buffer =>
  Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), label, 32));

/** AES-256-GCM. Layout: iv(12) | tag(16) | ciphertext */
export function seal(key: Buffer, text: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function open(key: Buffer, blob: Buffer): string {
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8");
}
