import { describe, expect, it } from "vitest";
import { encrypt, decrypt, encryptJson, decryptJson } from "@/lib/encryption";

process.env.ENCRYPTION_KEY = "test-encryption-key-for-testing-purposes-123";

describe("encryption", () => {
  it("encrypts and decrypts a string", () => {
    const original = "hello world";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(":");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertexts for the same plaintext", () => {
    const plaintext = "same text";
    const e1 = encrypt(plaintext);
    const e2 = encrypt(plaintext);
    expect(e1).not.toBe(e2);
  });

  it("encrypts and decrypts JSON objects", () => {
    const obj = { token: "abc123", url: "https://example.com" };
    const encrypted = encryptJson(obj);
    const decrypted = decryptJson<typeof obj>(encrypted);
    expect(decrypted).toEqual(obj);
  });

  it("throws on invalid encrypted format", () => {
    expect(() => decrypt("invalid-format")).toThrow();
    expect(() => decrypt("short")).toThrow();
  });

  it("handles empty string encryption", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });
});
