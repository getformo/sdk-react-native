/**
 * Traffic Source Utilities
 * Parse UTM parameters and referral information from URLs
 */
import type { ITrafficSource } from "../types";
/**
 * Parse UTM parameters and referral info from URL
 * Supports both web URLs (https://) and deep link URLs (myapp://)
 */
export declare function parseTrafficSource(url: string): Partial<ITrafficSource>;
/**
 * Store traffic source in session storage
 * Only stores if we have actual UTM or ref data
 */
export declare function storeTrafficSource(trafficSource: Partial<ITrafficSource>): void;
/**
 * Get stored traffic source from session
 * Returns undefined if no traffic source is stored
 */
export declare function getStoredTrafficSource(): Partial<ITrafficSource> | undefined;
/**
 * Clear stored traffic source from session
 */
export declare function clearTrafficSource(): void;
/**
 * Merge stored traffic source with current context
 * Stored traffic source is used as fallback - current context takes priority
 */
export declare function mergeWithStoredTrafficSource(context?: Record<string, unknown>): Record<string, unknown>;
//# sourceMappingURL=trafficSource.d.ts.map