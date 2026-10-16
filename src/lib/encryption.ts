import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is not set");
  return crypto.scryptSync(key, "lepatch-salt", 32);
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext}`;
}

export function decrypt(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted value format");
  const [ivHex, tagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  let plaintext = decipher.update(ciphertext, "hex", "utf8");
  plaintext += decipher.final("utf8");
  return plaintext;
}

export function encryptJson<T>(data: T): string {
  return encrypt(JSON.stringify(data));
}

export function decryptJson<T>(encrypted: string): T {
  return JSON.parse(decrypt(encrypted)) as T;
}
