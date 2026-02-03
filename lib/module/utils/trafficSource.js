/**
 * Traffic Source Utilities
 * Parse UTM parameters and referral information from URLs
 */

import { logger } from "../lib/logger";
import { storage } from "../lib/storage";
import { SESSION_TRAFFIC_SOURCE_KEY } from "../constants";
/**
 * Parse UTM parameters and referral info from URL
 * Supports both web URLs (https://) and deep link URLs (myapp://)
 */
export function parseTrafficSource(url) {
  try {
    // Handle deep link URLs that may not have standard URL format
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch {
      // If URL parsing fails, try to extract query string manually
      const queryStart = url.indexOf("?");
      if (queryStart === -1) {
        return {
          referrer: url
        };
      }

      // Create a fake URL for parsing query params
      urlObj = new URL(`http://localhost${url.substring(queryStart)}`);
    }
    const params = urlObj.searchParams;
    const trafficSource = {};

    // Extract UTM parameters
    if (params.has("utm_source")) trafficSource.utm_source = params.get("utm_source");
    if (params.has("utm_medium")) trafficSource.utm_medium = params.get("utm_medium");
    if (params.has("utm_campaign")) trafficSource.utm_campaign = params.get("utm_campaign");
    if (params.has("utm_term")) trafficSource.utm_term = params.get("utm_term");
    if (params.has("utm_content")) trafficSource.utm_content = params.get("utm_content");

    // Extract referral codes (check common parameter names)
    const refParams = ["ref", "referral", "refcode", "referrer_code"];
    for (const param of refParams) {
      if (params.has(param)) {
        trafficSource.ref = params.get(param);
        break;
      }
    }

    // Store the full URL as referrer
    trafficSource.referrer = url;
    return trafficSource;
  } catch (error) {
    logger.error("Error parsing traffic source from URL:", error);
    return {
      referrer: url
    };
  }
}

/**
 * Store traffic source in session storage
 * Only stores if we have actual UTM or ref data
 */
export function storeTrafficSource(trafficSource) {
  try {
    // Check if we have meaningful data to store (not just referrer)
    const hasData = trafficSource.utm_source || trafficSource.utm_medium || trafficSource.utm_campaign || trafficSource.utm_term || trafficSource.utm_content || trafficSource.ref;
    if (hasData || trafficSource.referrer) {
      storage().set(SESSION_TRAFFIC_SOURCE_KEY, JSON.stringify(trafficSource));
      logger.debug("Stored traffic source:", trafficSource);
    }
  } catch (error) {
    logger.error("Error storing traffic source:", error);
  }
}

/**
 * Get stored traffic source from session
 * Returns undefined if no traffic source is stored
 */
export function getStoredTrafficSource() {
  try {
    const stored = storage().get(SESSION_TRAFFIC_SOURCE_KEY);
    if (stored && typeof stored === "string") {
      return JSON.parse(stored);
    }
  } catch (error) {
    logger.debug("No stored traffic source found");
  }
  return undefined;
}

/**
 * Clear stored traffic source from session
 */
export function clearTrafficSource() {
  try {
    storage().remove(SESSION_TRAFFIC_SOURCE_KEY);
    logger.debug("Cleared traffic source from session");
  } catch (error) {
    logger.error("Error clearing traffic source:", error);
  }
}

/**
 * Merge stored traffic source with current context
 * Stored traffic source is used as fallback - current context takes priority
 */
export function mergeWithStoredTrafficSource(context) {
  const stored = getStoredTrafficSource();
  if (!stored) {
    return context || {};
  }

  // Merge: stored values as base, context values override
  return {
    ...stored,
    ...(context || {})
  };
}
//# sourceMappingURL=trafficSource.js.map