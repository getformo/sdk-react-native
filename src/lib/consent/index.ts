import { storage } from "../storage";
import { logger } from "../logger";

/**
 * Simple synchronous hash function for writeKey
 */
function hashWriteKey(writeKey: string): string {
  let h = 0;
  for (let i = 0; i < writeKey.length; i++) {
    const char = writeKey.charCodeAt(i);
    h = (h << 5) - h + char;
    h = h & h; // Convert to 32bit integer
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}

/**
 * Get a hashed key for consent storage
 */
function getConsentKey(writeKey: string, key: string): string {
  const hashedKey = hashWriteKey(writeKey);
  return `consent_${hashedKey}_${key}`;
}

/**
 * Set a consent flag
 */
export function setConsentFlag(
  writeKey: string,
  key: string,
  value: string
): void {
  try {
    const consentKey = getConsentKey(writeKey, key);
    storage().set(consentKey, value);
  } catch (error) {
    logger.error("Consent: Failed to set flag", error);
  }
}

/**
 * Get a consent flag
 */
export function getConsentFlag(writeKey: string, key: string): string | null {
  try {
    const consentKey = getConsentKey(writeKey, key);
    return storage().get(consentKey);
  } catch (error) {
    logger.error("Consent: Failed to get flag", error);
    return null;
  }
}

/**
 * Remove a consent flag
 */
export function removeConsentFlag(writeKey: string, key: string): void {
  try {
    const consentKey = getConsentKey(writeKey, key);
    storage().remove(consentKey);
  } catch (error) {
    logger.error("Consent: Failed to remove flag", error);
  }
}
