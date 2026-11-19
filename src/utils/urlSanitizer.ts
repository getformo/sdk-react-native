import { logger } from "../lib/logger";
import type { Options } from "../types";

/**
 * Query parameters that are ALWAYS stripped from the URLs the SDK stores or
 * reports, whatever the app configures, because they carry secrets that must
 * never reach Formo:
 * - privy_oauth_code:     Privy OAuth authorization code
 * - privy_oauth_state:    Privy OAuth CSRF state token
 * - privy_oauth_provider: Privy OAuth provider identifier
 *
 * Apps can extend the list with `tracking.excludeQueryParams` but cannot
 * remove these. Matched case-insensitively. Keep in sync with the web SDK
 * (DEFAULT_EXCLUDED_QUERY_PARAMS in sdk/src/event/constants.ts).
 */
export const DEFAULT_EXCLUDED_QUERY_PARAMS = [
  "privy_oauth_code",
  "privy_oauth_state",
  "privy_oauth_provider",
] as const;

/** The lowercased denylist: the built-ins plus the app's own names. */
export function resolveExcludedQueryParams(options?: Options): Set<string> {
  const tracking = options?.tracking;
  const configured =
    tracking !== null &&
    typeof tracking === "object" &&
    Array.isArray(tracking.excludeQueryParams)
      ? tracking.excludeQueryParams
      : [];
  return new Set(
    [...DEFAULT_EXCLUDED_QUERY_PARAMS, ...configured]
      .filter((key): key is string => typeof key === "string")
      .map((key) => key.toLowerCase())
  );
}

/** The decoded, lowercased name of one `name=value` pair of a query string. */
function queryParamName(pair: string): string {
  const eq = pair.indexOf("=");
  const raw = (eq === -1 ? pair : pair.slice(0, eq)).replace(/\+/g, " ");
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * Remove the excluded parameters from a query string ("a=1&b=2", no "?").
 * Returns the input itself when nothing is removed.
 */
export function redactQueryString(query: string, excluded: Set<string>): string {
  if (!query || excluded.size === 0) return query;
  const pairs = query.split("&");
  const kept = pairs.filter((pair) => !excluded.has(queryParamName(pair)));
  return kept.length === pairs.length ? query : kept.join("&");
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Remove the excluded query parameters from a URL.
 *
 * Works on the string, not through `new URL()`: deep links use custom schemes
 * and shapes ("myapp://?code=1", "myapp:path") that React Native's URL
 * implementation parses unevenly across versions, and a round trip would also
 * re-encode a URL that needed no change. Only the query is touched; the
 * scheme, path and fragment are left as they are, the same as the web SDK.
 * A URL with nothing to remove is returned unchanged, character for character.
 */
export function redactUrl(url: string, excluded: Set<string>): string {
  if (!url || excluded.size === 0) return url;
  const hashAt = url.indexOf("#");
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const queryAt = base.indexOf("?");
  if (queryAt === -1) {
    // No "?" and no scheme, but name=value pairs: a bare query string. The
    // saved referrer has this shape when it came from the Play install
    // referrer ("utm_source=google&utm_medium=cpc"), and one saved by an
    // earlier SDK version was never filtered.
    if (!URL_SCHEME.test(base) && base.includes("=")) {
      return redactQueryString(base, excluded) + hash;
    }
    return url;
  }

  const query = base.slice(queryAt + 1);
  const redacted = redactQueryString(query, excluded);
  if (redacted === query) return url;
  // No parameters left: drop the "?" too.
  return base.slice(0, queryAt) + (redacted ? `?${redacted}` : "") + hash;
}

/**
 * Run the app's `sanitizeUrl` hook on a URL the SDK is about to store or
 * report.
 *
 * Returns the URL to use, or "" to drop it. The hook is app code that exists
 * to keep private values (OAuth codes, tokens) out of analytics, so every
 * failure fails closed: a hook that throws, or returns something that is not
 * a string, drops the URL instead of letting the raw value through.
 */
export function applyUrlSanitizer(
  sanitizeUrl: ((url: string) => string) | undefined,
  url: string
): string {
  if (typeof sanitizeUrl !== "function") return url;
  try {
    const result = sanitizeUrl(url) as unknown;
    return typeof result === "string" ? result : "";
  } catch (error) {
    logger.error("FormoAnalytics: sanitizeUrl threw, dropping the URL", error);
    return "";
  }
}

export interface UrlCleaner {
  /** Clean a URL: run the app's hook, then strip excluded parameters. */
  url(url: string): string;
  /**
   * The same for a bare query string with no "?" (the Play install
   * referrer), which url() would not recognise as having a query.
   */
  queryString(query: string): string;
}

/**
 * The one filter every captured URL goes through, built from the options:
 * the app's `sanitizeUrl` hook, then the query-parameter denylist (built-in +
 * `tracking.excludeQueryParams`).
 *
 * The hook runs first, on the URL as it arrived. Its usual job is to
 * recognise a link by what it carries ("this has an OAuth code, drop it"),
 * and it could not do that if the denylist had already removed the code. The
 * denylist runs last so that it is a guarantee: nothing the hook returns can
 * put an excluded parameter back.
 *
 * Returns "" for a URL the hook dropped.
 */
export function createUrlCleaner(options?: Options): UrlCleaner {
  const excluded = resolveExcludedQueryParams(options);
  const hook = options?.sanitizeUrl;
  return {
    url: (url) => redactUrl(applyUrlSanitizer(hook, url), excluded),
    queryString: (query) =>
      redactQueryString(applyUrlSanitizer(hook, query), excluded),
  };
}
