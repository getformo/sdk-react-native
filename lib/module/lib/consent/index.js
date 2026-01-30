import { storage } from "../storage";
import { logger } from "../logger";

/**
 * Get consent storage key
 * Note: The storage adapter already prefixes keys with formo_rn_{writeKey}_
 * so we just need a simple consent prefix here
 */
function getConsentKey(_writeKey, key) {
  return `consent_${key}`;
}

/**
 * Set a consent flag
 */
export function setConsentFlag(writeKey, key, value) {
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
export function getConsentFlag(writeKey, key) {
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
export function removeConsentFlag(writeKey, key) {
  try {
    const consentKey = getConsentKey(writeKey, key);
    storage().remove(consentKey);
  } catch (error) {
    logger.error("Consent: Failed to remove flag", error);
  }
}
//# sourceMappingURL=index.js.map