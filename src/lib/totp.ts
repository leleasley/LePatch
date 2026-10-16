import crypto from "node:crypto";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DIGITS = 6;
const PERIOD = 30;
const WINDOW = 2;

export function generateSecret(): string {
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

export function generateTotpCode(secret: string): string {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / PERIOD);
  return generateHotp(key, time, DIGITS);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) return false;

  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / PERIOD);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const candidate = generateHotp(key, time + i, DIGITS);
    if (timingSafeEqual(candidate, normalizedCode)) return true;
  }
  return false;
}

export function getOtpauthUrl(email: string, secret: string, issuer?: string): string {
  const issuerName = issuer || "LePatch";
  const encodedEmail = encodeURIComponent(email);
  const encodedIssuer = encodeURIComponent(issuerName);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < count; i++) {
    let code = "";
    const bytes = crypto.randomBytes(8);
    for (let j = 0; j < 8; j++) {
      code += alphabet[bytes[j] % alphabet.length];
    }
    codes.push(code);
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function verifyBackupCode(
  code: string,
  hashes: string[]
): { valid: boolean; index: number } {
  const codeHash = hashBackupCode(code);
  for (let i = 0; i < hashes.length; i++) {
    if (timingSafeEqual(hashes[i], codeHash)) {
      return { valid: true, index: i };
    }
  }
  return { valid: false, index: -1 };
}

// --- Internal helpers ---

function generateHotp(key: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/\s+/g, "").replace(/=+$/, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) throw new Error(`Invalid base32 character: ${char}`);
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}
