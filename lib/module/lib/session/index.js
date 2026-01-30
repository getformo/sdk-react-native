import { SESSION_WALLET_DETECTED_KEY, SESSION_WALLET_IDENTIFIED_KEY } from "../../constants";
import { storage } from "../storage";
import { logger } from "../logger";
export { SESSION_WALLET_DETECTED_KEY, SESSION_WALLET_IDENTIFIED_KEY };

/**
 * Session manager for tracking wallet detection and identification
 * Uses in-memory state that resets on app restart
 */
export class FormoAnalyticsSession {
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
      const detected = storage().get(SESSION_WALLET_DETECTED_KEY);
      if (detected) {
        const parsed = JSON.parse(detected);
        this.detectedWallets = new Set(parsed);
      }
      const identified = storage().get(SESSION_WALLET_IDENTIFIED_KEY);
      if (identified) {
        const parsed = JSON.parse(identified);
        this.identifiedWallets = new Set(parsed);
      }
    } catch (error) {
      logger.debug("Session: Failed to load from storage", error);
    }
  }

  /**
   * Save session state to storage
   */
  saveToStorage() {
    try {
      storage().set(SESSION_WALLET_DETECTED_KEY, JSON.stringify(Array.from(this.detectedWallets)));
      storage().set(SESSION_WALLET_IDENTIFIED_KEY, JSON.stringify(Array.from(this.identifiedWallets)));
    } catch (error) {
      logger.debug("Session: Failed to save to storage", error);
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
    storage().remove(SESSION_WALLET_DETECTED_KEY);
    storage().remove(SESSION_WALLET_IDENTIFIED_KEY);
  }
}
//# sourceMappingURL=index.js.map