import { sha256 } from "ethereum-cryptography/sha256";
import { utf8ToBytes, bytesToHex } from "ethereum-cryptography/utils";

/**
 * Generate a SHA-256 hash for event deduplication
 * Uses first 16 hex chars (64 bits) for balance of collision resistance and storage
 */
export async function hash(input: string): Promise<string> {
  const bytes = utf8ToBytes(input);
  const hashBytes = sha256(bytes);
  const hex = bytesToHex(hashBytes);
  // Use first 16 chars (64 bits) - provides ~2^32 events before 50% collision probability
  return hex.slice(0, 16);
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
