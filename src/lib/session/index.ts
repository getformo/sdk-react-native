import {
  SESSION_WALLET_DETECTED_KEY,
  SESSION_WALLET_IDENTIFIED_KEY,
  SESSION_WALLET_MARKED_AT_KEY,
  WALLET_MARKER_TTL_MS,
} from "../../constants";
import { storage } from "../storage";
import { logger } from "../logger";

export { SESSION_WALLET_DETECTED_KEY, SESSION_WALLET_IDENTIFIED_KEY };

/**
 * Session manager for tracking wallet detection and identification.
 * Persists to storage to avoid duplicate detection/identification events.
 *
 * Storage here is persistent, unlike a browser session cookie, so the
 * markers carry their own expiry: a day from when they were first written,
 * the lifetime of the web SDK's marker cookie. Without it a marker written
 * on install would suppress detect for the life of the app.
 */
export class FormoAnalyticsSession {
  private detectedWallets: Set<string> = new Set();
  private identifiedWallets: Set<string> = new Set();
  /** When the current markers were first written, 0 when there are none. */
  private markedAt = 0;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load session state from storage
   */
  private loadFromStorage(): void {
    try {
      const markedAtRaw = storage().get(SESSION_WALLET_MARKED_AT_KEY);
      const markedAt = markedAtRaw ? parseInt(markedAtRaw, 10) : 0;
      if (markedAt && Date.now() - markedAt > WALLET_MARKER_TTL_MS) {
        this.clear();
        return;
      }
      this.markedAt = markedAt;
      const detected = storage().get(SESSION_WALLET_DETECTED_KEY);
      if (detected) {
        const parsed = JSON.parse(detected) as string[];
        this.detectedWallets = new Set(parsed);
      }

      const identified = storage().get(SESSION_WALLET_IDENTIFIED_KEY);
      if (identified) {
        const parsed = JSON.parse(identified) as string[];
        this.identifiedWallets = new Set(parsed);
      }
      // Markers written by a version without the timestamp start their day
      // now; otherwise they would never expire.
      if (!this.markedAt && (this.detectedWallets.size || this.identifiedWallets.size)) {
        this.markedAt = Date.now();
        storage().set(SESSION_WALLET_MARKED_AT_KEY, String(this.markedAt));
      }
    } catch (error) {
      logger.debug("Session: Failed to load from storage", error);
    }
  }

  /**
   * Save session state to storage
   */
  private saveToStorage(): void {
    try {
      if (!this.markedAt) {
        this.markedAt = Date.now();
        storage().set(SESSION_WALLET_MARKED_AT_KEY, String(this.markedAt));
      }
      storage().set(
        SESSION_WALLET_DETECTED_KEY,
        JSON.stringify(Array.from(this.detectedWallets))
      );
      storage().set(
        SESSION_WALLET_IDENTIFIED_KEY,
        JSON.stringify(Array.from(this.identifiedWallets))
      );
    } catch (error) {
      logger.debug("Session: Failed to save to storage", error);
    }
  }

  /**
   * Check if a wallet has been detected in this session
   */
  public isWalletDetected(rdns: string): boolean {
    this.expireIfStale();
    return this.detectedWallets.has(rdns);
  }

  /**
   * Mark a wallet as detected
   */
  public markWalletDetected(rdns: string): void {
    this.detectedWallets.add(rdns);
    this.saveToStorage();
  }

  /**
   * Check if a wallet + address combination has been identified
   */
  public isWalletIdentified(address: string, rdns: string): boolean {
    this.expireIfStale();
    const key = `${address.toLowerCase()}:${rdns}`;
    return this.identifiedWallets.has(key);
  }

  /** Drop every marker once the day they were written in has passed. */
  private expireIfStale(): void {
    if (this.markedAt && Date.now() - this.markedAt > WALLET_MARKER_TTL_MS) {
      this.clear();
    }
  }

  /**
   * Mark a wallet + address combination as identified
   */
  public markWalletIdentified(address: string, rdns: string): void {
    const key = `${address.toLowerCase()}:${rdns}`;
    this.identifiedWallets.add(key);
    this.saveToStorage();
  }

  /**
   * Forget which wallets were identified, so a login after a logout
   * identifies again. The detect markers stay: the wallets are still known.
   */
  public clearIdentified(): void {
    this.identifiedWallets.clear();
    storage().remove(SESSION_WALLET_IDENTIFIED_KEY);
  }

  /**
   * Clear all session data
   */
  public clear(): void {
    this.detectedWallets.clear();
    this.identifiedWallets.clear();
    this.markedAt = 0;
    storage().remove(SESSION_WALLET_DETECTED_KEY);
    storage().remove(SESSION_WALLET_IDENTIFIED_KEY);
    storage().remove(SESSION_WALLET_MARKED_AT_KEY);
  }
}
