"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getConsentFlag = getConsentFlag;
exports.removeConsentFlag = removeConsentFlag;
exports.setConsentFlag = setConsentFlag;
var _storage = require("../storage");
var _logger = require("../logger");
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
function setConsentFlag(writeKey, key, value) {
  try {
    const consentKey = getConsentKey(writeKey, key);
    (0, _storage.storage)().set(consentKey, value);
  } catch (error) {
    _logger.logger.error("Consent: Failed to set flag", error);
  }
}

/**
 * Get a consent flag
 */
function getConsentFlag(writeKey, key) {
  try {
    const consentKey = getConsentKey(writeKey, key);
    return (0, _storage.storage)().get(consentKey);
  } catch (error) {
    _logger.logger.error("Consent: Failed to get flag", error);
    return null;
  }
}

/**
 * Remove a consent flag
 */
function removeConsentFlag(writeKey, key) {
  try {
    const consentKey = getConsentKey(writeKey, key);
    (0, _storage.storage)().remove(consentKey);
  } catch (error) {
    _logger.logger.error("Consent: Failed to remove flag", error);
  }
}
//# sourceMappingURL=index.js.map