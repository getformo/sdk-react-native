import type { ITrafficSource } from "../types";

/**
 * Traffic-source value sanitization.
 *
 * Ported from the Formo web SDK, where vulnerability scanners (e.g. Acunetix)
 * crawling customer sites injected XSS probes such as
 * `javascript:domxssExecutionSink(1,"'\"><xsstag>()locxss")` or
 * `<script>alert(1)</script>` into every query parameter. Without validation
 * those payloads are captured verbatim as utm_* / ref values, persisted as
 * sticky session traffic sources, and pollute attribution reporting.
 *
 * React Native has the same exposure through two attacker-reachable inputs:
 *
 * - Deep links handed to `setTrafficSourceFromUrl`. Anyone who can get a user
 *   to open `myapp://x?utm_source=<script>alert(1)</script>` controls the
 *   value verbatim, and it is persisted for the whole session.
 * - The Android Play Install Referrer string, which is derived from the
 *   `referrer` parameter of a Play Store URL and is likewise attacker-supplied.
 *
 * Each field class gets the tightest rule its legitimate values allow:
 *
 * - Referral codes are short tokens; >99.5% of production values match the
 *   strict pattern and none of the remainder are legitimate (scanner
 *   payloads, mangled encodings, URLs glued to codes).
 * - UTM values are free-form (spaces, unicode, `+` are legitimate), so they
 *   only reject markup/quote characters, dangerous URL schemes, control and
 *   zero-width characters, and absurd lengths.
 * - `referrer` diverges from the web SDK, which leaves it untouched because
 *   there it is a browser-set `document.referrer` already handled by redactUrl.
 *   In React Native `referrer` holds the raw deep-link URL the attacker
 *   supplied, so sanitizing only the utm_ and ref fields would still let the
 *   payload through. It gets a URL-sized length budget and is checked both raw
 *   and percent-decoded — a URL encodes its payload, so a raw-only check would
 *   pass `?utm_source=%3Cscript%3E` straight through.
 *
 * Invalid values are dropped to "" — the same representation as "parameter
 * absent" — rather than repaired, so a poisoned value can never be persisted
 * or reported.
 *
 * The web SDK additionally sanitizes ad-platform click IDs (gclid, fbclid,
 * ...). This SDK does not capture them, so that rule is intentionally absent;
 * add it here alongside the capture if click IDs are ever supported.
 */

const REF_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

const UTM_MAX_LENGTH = 255;

// URLs are legitimately much longer than a UTM value, but not unbounded —
// this is well above any real deep link and still bounds what gets persisted.
const REFERRER_MAX_LENGTH = 2_048;

// Markup/quote/backslash characters plus C0/C1 control characters and
// zero-width / bidi / BOM / replacement characters (mangled-encoding
// markers). Explicit ranges instead of \p{C} to avoid the `u`-flag
// property-escape requirement.
const FORBIDDEN_CHARS =
  /[<>"'`\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060\ufeff\ufffd]/;

// Applied to the percent-DECODED form of a referrer. Narrower than the raw
// set on purpose: a decoded query value legitimately contains quotes and
// backslashes (`?q=%22running%20shoes%22`), and those are harmless in an
// analytics field. Markup and invisible characters are what indicate an
// injected payload rather than a real deep link.
const DECODED_FORBIDDEN_CHARS =
  /[<>\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060\ufeff\ufffd]/;

// Values smuggling an executable/URL scheme, e.g. `javascript:alert(1)`.
const FORBIDDEN_SCHEME_PREFIX = /^\s*(javascript|data|vbscript):/i;

/**
 * Whether a value smuggles a dangerous scheme, anywhere a URL parser would
 * consider the start of a value.
 *
 * The pattern is anchored, so testing the string as a whole is not enough once
 * decoding can reveal separators that were themselves encoded: with the `=` in
 * `?utm_source%3Djavascript%253Aalert(1)` encoded, URLSearchParams reports one
 * key that decodes to `utm_source=javascript:alert(1)`, which the anchored test
 * never matches. Splitting on the separators after decoding puts the payload
 * back at the start of a segment.
 */
const hasForbiddenScheme = (value: string): boolean =>
  FORBIDDEN_SCHEME_PREFIX.test(value) ||
  value.split(/[?&=#]/).some((segment) => FORBIDDEN_SCHEME_PREFIX.test(segment));

/**
 * Percent-decode one layer without ever throwing. `decodeURIComponent` rejects
 * the entire string on a single malformed escape (a stray `%`), which would let
 * `...%3Cscript%3E%` skip the decoded checks completely.
 *
 * Each *run* of consecutive escapes is decoded as a unit rather than byte by
 * byte, because a multi-byte character spans several escapes: `%E3%80%80` is
 * one ideographic space, and decoding `%E3` alone throws. Byte-wise decoding
 * would therefore never produce the whitespace that lets `^\s*javascript:`
 * match `%E3%80%80javascript%3Aalert(1)`. A run that is not valid UTF-8, and
 * any stray `%`, is left as-is.
 */
const decodeRun = (run: string): string => {
  try {
    return decodeURIComponent(run);
  } catch {
    // One invalid byte anywhere in the run would otherwise blind the whole
    // run — appending `%C0` next to `%3C` is enough to hide a `<`. Decode the
    // largest valid group at each position instead, longest first so multi-byte
    // sequences (up to four escapes) still group correctly, and pass through
    // any escape that cannot be decoded at all.
    const escapes = run.match(/%[0-9A-Fa-f]{2}/g) ?? [];
    let out = "";
    let i = 0;
    while (i < escapes.length) {
      let taken = 0;
      for (let len = Math.min(4, escapes.length - i); len >= 1; len--) {
        try {
          out += decodeURIComponent(escapes.slice(i, i + len).join(""));
          taken = len;
          break;
        } catch {
          // Try a shorter group.
        }
      }
      if (taken === 0) {
        out += escapes[i];
        taken = 1;
      }
      i += taken;
    }
    return out;
  }
};

const decodeOnce = (value: string): string =>
  value.replace(/(?:%[0-9A-Fa-f]{2})+/g, decodeRun);

/**
 * Decode to a fixed point, so a payload encoded any number of times
 * (`%253Cscript%253E`, `%25252525253Cscript...`) is compared in a form the
 * markup check can see.
 *
 * The bound is the input length rather than a fixed number of layers, because
 * a fixed number is reachable: re-encoding `javascript:alert(1)` only grows the
 * single `%` by two characters per layer, so 66 layers fit in 151 characters
 * and any small constant can be encoded past. Every productive pass turns a
 * three-character escape into one character, so a string of length n admits
 * fewer than n productive passes — this bound is always sufficient and still
 * guarantees termination.
 */
const decodeDeep = (value: string): string => {
  let current = value;
  for (let i = 0; i < value.length; i++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
};

const sanitizeRef = (value: string): string =>
  REF_PATTERN.test(value) ? value : "";

/**
 * URLSearchParams has already decoded one layer by the time a UTM value gets
 * here, so a payload encoded twice arrives still encoded:
 * `utm_source=%253Cscript%253E` reads as the literal `%3Cscript%3E`, which
 * contains no raw markup and would pass a raw-only check. Test the decoded
 * form as well.
 */
const sanitizeUtm = (value: string): string => {
  if (value.length > UTM_MAX_LENGTH) return "";
  if (FORBIDDEN_CHARS.test(value) || hasForbiddenScheme(value)) {
    return "";
  }
  const decoded = decodeDeep(value);
  if (
    DECODED_FORBIDDEN_CHARS.test(decoded) ||
    hasForbiddenScheme(decoded)
  ) {
    return "";
  }
  return value;
};

/**
 * The decoded parts of a referrer's query string — keys as well as values.
 * Handles both a full URL ("myapp://x?utm_source=...") and the bare query
 * string the Android install referrer supplies ("utm_source=...&utm_medium=").
 * Returns nothing when there is no query to read; the caller still checks the
 * whole string.
 *
 * Keys matter because a parameter with no "=" parses entirely as a key with an
 * empty value: "?%6Aavascript:alert(1)" would otherwise contribute nothing to
 * inspect.
 */
const referrerParamParts = (value: string): string[] => {
  const queryStart = value.indexOf("?");
  const query = queryStart === -1 ? value : value.slice(queryStart + 1);
  if (!query || (queryStart === -1 && !query.includes("="))) return [];
  try {
    // URLSearchParams decodes leniently and does not throw on a stray "%".
    const parts: string[] = [];
    for (const [key, paramValue] of new URLSearchParams(query)) {
      parts.push(key, paramValue);
    }
    return parts;
  } catch {
    return [];
  }
};

/**
 * A URL carries its payload percent-encoded — `Linking` and the browser both
 * encode `<` and `>` — so a raw-only check would pass
 * `?utm_source=%3Cscript%3E` straight through.
 *
 * Checked three ways, because pattern-matching the URL as one opaque string
 * misses what a structural read catches: the whole value raw, the whole value
 * decoded, and each decoded query part — keys included — on its own. The last
 * is what catches a smuggled scheme, since FORBIDDEN_SCHEME_PREFIX is anchored
 * and `?utm_source=javascript:alert(1)` only matches once that parameter is
 * read apart from the `myapp://` URL containing it.
 */
const sanitizeReferrer = (value: string): string => {
  if (value.length > REFERRER_MAX_LENGTH) return "";
  if (FORBIDDEN_CHARS.test(value) || hasForbiddenScheme(value)) {
    return "";
  }

  const decodedWhole = decodeDeep(value);
  if (
    DECODED_FORBIDDEN_CHARS.test(decodedWhole) ||
    hasForbiddenScheme(decodedWhole)
  ) {
    return "";
  }

  for (const part of referrerParamParts(value)) {
    const decoded = decodeDeep(part);
    if (
      DECODED_FORBIDDEN_CHARS.test(decoded) ||
      hasForbiddenScheme(decoded)
    ) {
      return "";
    }
  }

  return value;
};

/**
 * Sanitize every traffic-source field of a (possibly sparse) traffic-source
 * object. Unknown keys fall through to the UTM rule, the most permissive of
 * the value rules.
 */
export const sanitizeTrafficSources = <T extends Partial<ITrafficSource>>(
  trafficSources: T
): T => {
  const result: Record<string, unknown> = { ...trafficSources };
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value !== "string" || value === "") {
      continue;
    }
    if (key === "ref") {
      result[key] = sanitizeRef(value);
    } else if (key === "referrer") {
      result[key] = sanitizeReferrer(value);
    } else {
      result[key] = sanitizeUtm(value);
    }
  }
  return result as T;
};

export { sanitizeRef, sanitizeUtm, sanitizeReferrer };
