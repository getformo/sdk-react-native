import { sha256 } from "ethereum-cryptography/sha256";
import { utf8ToBytes, bytesToHex } from "ethereum-cryptography/utils";

/**
 * Generate a SHA-256 hash for event deduplication
 * Returns full 64 hex chars to match web SDK format
 */
export async function hash(input: string): Promise<string> {
  const bytes = utf8ToBytes(input);
  const hashBytes = sha256(bytes);
  return bytesToHex(hashBytes);
}

/**
 * Generate a UUID v4.
 *
 * Prefers a cryptographically secure RNG (Web Crypto). In React Native this is
 * present whenever the app polyfills it via `react-native-get-random-values` —
 * which wallet apps using wagmi/viem already do, since those require secure
 * randomness. Falls back to `Math.random` only on a runtime with no Web Crypto,
 * so the SDK never throws. (These IDs are analytics identifiers, not security
 * tokens, so the fallback is acceptable when no secure RNG exists.)
 */
export function generateUUID(): string {
  const webCrypto: {
    randomUUID?: () => string;
    getRandomValues?: (a: Uint8Array) => Uint8Array;
  } | undefined = (globalThis as { crypto?: unknown }).crypto as
    | { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array }
    | undefined;

  // Fastest secure path: native randomUUID.
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  // Secure random bytes formatted as a UUID v4.
  if (typeof webCrypto?.getRandomValues === "function") {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last-resort fallback (no Web Crypto available). Non-cryptographic, but only
  // reached on bare runtimes; acceptable for non-security-sensitive analytics IDs.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
