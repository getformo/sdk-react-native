"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FormoAnalyticsSession = void 0;
Object.defineProperty(exports, "SESSION_WALLET_DETECTED_KEY", {
  enumerable: true,
  get: function () {
    return _constants.SESSION_WALLET_DETECTED_KEY;
  }
});
Object.defineProperty(exports, "SESSION_WALLET_IDENTIFIED_KEY", {
  enumerable: true,
  get: function () {
    return _constants.SESSION_WALLET_IDENTIFIED_KEY;
  }
});
var _constants = require("../../constants");
var _storage = require("../storage");
var _logger = require("../logger");
/**
 * Session manager for tracking wallet detection and identification
 * Persists to session storage to avoid duplicate detection/identification events
 * within the same session
 */
class FormoAnalyticsSession {
  detectedWallets = new Set();
  identifiedWallets = new Set();
  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load session state from storage
   */
  loadFromStorage() {
    try {
      const detected = (0, _storage.storage)().get(_constants.SESSION_WALLET_DETECTED_KEY);
      if (detected) {
        const parsed = JSON.parse(detected);
        this.detectedWallets = new Set(parsed);
      }
      const identified = (0, _storage.storage)().get(_constants.SESSION_WALLET_IDENTIFIED_KEY);
      if (identified) {
        const parsed = JSON.parse(identified);
        this.identifiedWallets = new Set(parsed);
      }
    } catch (error) {
      _logger.logger.debug("Session: Failed to load from storage", error);
    }
  }

  /**
   * Save session state to storage
   */
  saveToStorage() {
    try {
      (0, _storage.storage)().set(_constants.SESSION_WALLET_DETECTED_KEY, JSON.stringify(Array.from(this.detectedWallets)));
      (0, _storage.storage)().set(_constants.SESSION_WALLET_IDENTIFIED_KEY, JSON.stringify(Array.from(this.identifiedWallets)));
    } catch (error) {
      _logger.logger.debug("Session: Failed to save to storage", error);
    }
  }

  /**
   * Check if a wallet has been detected in this session
   */
  isWalletDetected(rdns) {
    return this.detectedWallets.has(rdns);
  }

  /**
   * Mark a wallet as detected
   */
  markWalletDetected(rdns) {
    this.detectedWallets.add(rdns);
    this.saveToStorage();
  }

  /**
   * Check if a wallet + address combination has been identified
   */
  isWalletIdentified(address, rdns) {
    const key = `${address.toLowerCase()}:${rdns}`;
    return this.identifiedWallets.has(key);
  }

  /**
   * Mark a wallet + address combination as identified
   */
  markWalletIdentified(address, rdns) {
    const key = `${address.toLowerCase()}:${rdns}`;
    this.identifiedWallets.add(key);
    this.saveToStorage();
  }

  /**
   * Clear all session data
   */
  clear() {
    this.detectedWallets.clear();
    this.identifiedWallets.clear();
    (0, _storage.storage)().remove(_constants.SESSION_WALLET_DETECTED_KEY);
    (0, _storage.storage)().remove(_constants.SESSION_WALLET_IDENTIFIED_KEY);
  }
}
exports.FormoAnalyticsSession = FormoAnalyticsSession;
//# sourceMappingURL=index.js.map