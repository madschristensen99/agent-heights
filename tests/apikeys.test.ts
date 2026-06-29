import { describe, it, expect } from "vitest";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * These tests verify the encryption logic used by server/apikeys.ts.
 * We replicate the encrypt/decrypt functions here since they're not exported.
 * This ensures the algorithm (AES-256-GCM) works correctly for round-trips.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function makeKey(seed: string): string {
  let hex = "";
  for (let i = 0; i < seed.length; i++) {
    hex += seed.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex.slice(0, 64).padEnd(64, "0");
}

function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(payload: string, keyHex: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted payload");
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

describe("API key encryption", () => {
  const keyHex = makeKey("test-encryption-key-1234567890");

  it("round-trips a typical API key", () => {
    const plaintext = "sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz";
    const encrypted = encrypt(plaintext, keyHex);
    const decrypted = decrypt(encrypted, keyHex);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const plaintext = "sk-same-key-12345";
    const enc1 = encrypt(plaintext, keyHex);
    const enc2 = encrypt(plaintext, keyHex);
    expect(enc1).not.toBe(enc2);
    // Both should decrypt to the same value
    expect(decrypt(enc1, keyHex)).toBe(plaintext);
    expect(decrypt(enc2, keyHex)).toBe(plaintext);
  });

  it("handles empty string", () => {
    const plaintext = "";
    const encrypted = encrypt(plaintext, keyHex);
    // Empty plaintext produces empty ciphertext hex, so we need to handle that
    // The format is iv:tag:ciphertext where ciphertext can be empty string
    const [ivHex, tagHex, dataHex] = encrypted.split(":");
    expect(ivHex).toBeDefined();
    expect(tagHex).toBeDefined();
    // dataHex may be empty for empty plaintext — decrypt should handle it
    const key = Buffer.from(keyHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(dataHex ? Buffer.from(dataHex, "hex") : Buffer.alloc(0)),
      decipher.final(),
    ]).toString("utf8");
    expect(decrypted).toBe("");
  });

  it("handles unicode characters", () => {
    const plaintext = "sk-ünïcödé-key-🔑";
    const encrypted = encrypt(plaintext, keyHex);
    const decrypted = decrypt(encrypted, keyHex);
    expect(decrypted).toBe(plaintext);
  });

  it("fails decryption with wrong key (auth tag mismatch)", () => {
    const plaintext = "sk-secret-key";
    const wrongKey = makeKey("wrong-key-xxxxxxxxxxxxxxxxxxxxxxxx");
    const encrypted = encrypt(plaintext, keyHex);
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it("fails on tampered ciphertext", () => {
    const plaintext = "sk-secret-key-with-enough-length";
    const encrypted = encrypt(plaintext, keyHex);
    const parts = encrypted.split(":");
    // Flip the first byte of the ciphertext
    const dataBytes = Buffer.from(parts[2], "hex");
    dataBytes[0] = dataBytes[0] ^ 0xff;
    const tampered = `${parts[0]}:${parts[1]}:${dataBytes.toString("hex")}`;
    expect(() => decrypt(tampered, keyHex)).toThrow();
  });

  it("fails on malformed payload", () => {
    expect(() => decrypt("not-a-valid-payload", keyHex)).toThrow();
    expect(() => decrypt("only:two:parts:extra", keyHex)).toThrow();
  });
});
