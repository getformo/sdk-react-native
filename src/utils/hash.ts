import { sha256 } from "ethereum-cryptography/sha256";
import { utf8ToBytes, bytesToHex } from "ethereum-cryptography/utils";

/**
 * Generate a SHA-256 hash for event deduplication
 * Returns full 64 hex chars to match web SDK format
 *
 * Synchronous on purpose: the event pipeline hashes on the enqueue path, and
 * every extra await there is a microtask yield that can reorder events that
 * were emitted back to back.
 */
export function hash(input: string): string {
  const bytes = utf8ToBytes(input);
  const hashBytes = sha256(bytes);
  return bytesToHex(hashBytes);
}

/**
 * Serialize a value so equal values give the same string whatever the key
 * insertion order. Object keys are sorted recursively; arrays keep their
 * order. Values follow JSON.stringify: undefined, functions and symbols are
 * omitted from objects and become null in arrays, non-finite numbers become
 * null, and toJSON() is honored. Returns undefined when JSON would omit the
 * value, and throws where JSON.stringify throws (BigInt, cycles), so a
 * payload that cannot go on the wire fails at the same point as before.
 */
export function stableStringify(
  value: unknown,
  seen: Set<unknown> = new Set()
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "function") return undefined;
  if (typeof value === "symbol") return undefined;
  if (value === null) return "null";
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }
  if (typeof value !== "object") return JSON.stringify(value);

  // toJSON() first, as JSON.stringify does; the cycle check applies to what
  // it returns, since that is what goes on the wire.
  const maybeToJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof maybeToJSON === "function") {
    return stableStringify((maybeToJSON as () => unknown).call(value), seen);
  }
  if (seen.has(value)) {
    throw new TypeError("Converting circular structure to JSON");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      // By index, so a hole serializes as null the way JSON.stringify does.
      const items: string[] = [];
      for (let i = 0; i < value.length; i++) {
        items.push(stableStringify(value[i], seen) ?? "null");
      }
      return `[${items.join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const encoded = stableStringify(record[key], seen);
      if (encoded === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${encoded}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    // Only cycles are guarded. The same object used twice as siblings must
    // serialize the same both times.
    seen.delete(value);
  }
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

  // No Web Crypto available: derive a UUID from a monotonic counter + timestamp
  // + Math.random, hashed with SHA-256. Math.random is not cryptographically
  // secure — CodeQL flags it, and that alert is intentionally dismissed: these
  // are analytics identifiers, not security tokens, and this branch is only
  // reached on runtimes without a Web Crypto polyfill. The Math.random term
  // restores the cross-process entropy needed so two fresh app processes that
  // make their first call within the same millisecond do not collide (the
  // counter alone only prevents collisions within a single process).
  uuidFallbackCounter = (uuidFallbackCounter + 1) >>> 0;
  return formatUuidV4(
    sha256(utf8ToBytes(`${Date.now()}-${uuidFallbackCounter}-${Math.random()}`))
  );
}
