import { logger } from "../lib/logger";

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
