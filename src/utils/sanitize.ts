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
 *   payload through. It gets the same character rules with a URL-sized budget;
 *   a well-formed URL percent-encodes the rejected characters anyway.
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

// Values smuggling an executable/URL scheme, e.g. `javascript:alert(1)`.
const FORBIDDEN_SCHEME_PREFIX = /^\s*(javascript|data|vbscript):/i;

const sanitizeRef = (value: string): string =>
  REF_PATTERN.test(value) ? value : "";

const sanitizeUtm = (value: string): string =>
  value.length <= UTM_MAX_LENGTH &&
  !FORBIDDEN_CHARS.test(value) &&
  !FORBIDDEN_SCHEME_PREFIX.test(value)
    ? value
    : "";

const sanitizeReferrer = (value: string): string =>
  value.length <= REFERRER_MAX_LENGTH &&
  !FORBIDDEN_CHARS.test(value) &&
  !FORBIDDEN_SCHEME_PREFIX.test(value)
    ? value
    : "";

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
