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

// Monotonic counter for the no-Web-Crypto fallback below. Guarantees the
// fallback produces distinct ids even for calls within the same millisecond.
let uuidFallbackCounter = 0;

/** Format 16 bytes as a UUID v4 string (sets the version + variant bits). */
function formatUuidV4(source: Uint8Array): string {
  const bytes = source.slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generate a UUID v4.
 *
 * Uses a cryptographically secure RNG (Web Crypto), which is present in React
 * Native whenever the app polyfills it via `react-native-get-random-values` —
 * wallet apps using wagmi/viem already do, since those require secure randomness.
 * On a runtime with no Web Crypto at all, derives a unique id from a monotonic
 * counter + timestamp via SHA-256 (no PRNG) so the SDK never throws; that path
 * is not cryptographically random, but it is only ever reached without Web
 * Crypto, and these IDs are analytics identifiers, not security tokens.
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
    return formatUuidV4(webCrypto.getRandomValues(new Uint8Array(16)));
  }

  // No Web Crypto available: derive a unique, UUID-shaped id from a monotonic
  // counter + timestamp. Not cryptographically random, but collision-free within
  // a process and only reached on runtimes without a secure RNG.
  uuidFallbackCounter = (uuidFallbackCounter + 1) >>> 0;
  return formatUuidV4(sha256(utf8ToBytes(`${Date.now()}-${uuidFallbackCounter}`)));
}
