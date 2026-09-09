import {
  SESSION_WALLET_DETECTED_AT_KEY,
  SESSION_WALLET_DETECTED_KEY,
  SESSION_WALLET_IDENTIFIED_AT_KEY,
  SESSION_WALLET_IDENTIFIED_KEY,
  WALLET_MARKER_TTL_MS,
} from "../../constants";
import type { IFormoEventProperties } from "../../types";
import { hash, stableStringify } from "../../utils/hash";
import { storage } from "../storage";
import { logger } from "../logger";

export { SESSION_WALLET_DETECTED_KEY, SESSION_WALLET_IDENTIFIED_KEY };

/** Newest entries win once a set is full, as with the web SDK's cookies. */
const MAX_MARKER_ENTRIES = 20;

/** Written by versions that shared one expiry between both sets. */
const LEGACY_WALLET_MARKED_AT_KEY = "wallet_marked_at";

/**
 * One persisted marker set: its entries, and when it was last written.
 * `at` is 0 while the set is empty.
 */
type MarkerSet = {
  key: string;
  atKey: string;
  entries: Set<string>;
  at: number;
};

/**
 * Short fingerprint of an identify's properties, folded into the dedup key
 * so a re-identify with changed properties is sent again. Empty when there
 * are no properties or nothing would go on the wire.
 */
function fingerprintProperties(properties?: IFormoEventProperties): string {
  if (!properties) return "";
  try {
    const canonical = stableStringify(properties);
    if (canonical === undefined || canonical === "{}") return "";
    return hash(canonical).slice(0, 16);
  } catch (error) {
    // Reading a property can run user code. Fail closed to a constant so
    // dedup degrades to once per wallet instead of losing the identify.
    logger.warn("Session: failed to fingerprint identify properties", error);
    return "nohash";
  }
}

/**
 * Session manager for tracking wallet detection and identification.
 * Persists to storage to avoid duplicate detection/identification events.
 *
 * Storage here is persistent, unlike a browser session cookie, so each
 * marker set carries its own expiry: a day from its own last write, the
 * lifetime of the matching web SDK cookie. Without it a marker written on
 * install would suppress detect for the life of the app.
 */
export class FormoAnalyticsSession {
  private detected: MarkerSet = {
    key: SESSION_WALLET_DETECTED_KEY,
    atKey: SESSION_WALLET_DETECTED_AT_KEY,
    entries: new Set(),
    at: 0,
  };
  private identified: MarkerSet = {
    key: SESSION_WALLET_IDENTIFIED_KEY,
    atKey: SESSION_WALLET_IDENTIFIED_AT_KEY,
    entries: new Set(),
    at: 0,
  };

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load session state from storage
   */
  private loadFromStorage(): void {
    try {
      if (storage().get(LEGACY_WALLET_MARKED_AT_KEY)) {
        storage().remove(LEGACY_WALLET_MARKED_AT_KEY);
      }
      this.loadSet(this.detected);
      this.loadSet(this.identified);
    } catch (error) {
      logger.debug("Session: Failed to load from storage", error);
    }
  }

  private loadSet(set: MarkerSet): void {
    const raw = storage().get(set.key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as string[];
    set.entries = new Set(
      parsed.slice(-MAX_MARKER_ENTRIES).map((entry) => this.migrateEntry(set, entry))
    );
    if (set.entries.size === 0) return;
    set.at = this.readTimestamp(set);
    if (!set.at) {
      // Markers written by a version without the timestamp get their day
      // from now; otherwise they would never expire.
      set.at = Date.now();
      storage().set(set.atKey, String(set.at));
    }
    this.expireIfStale(set);
  }

  /** An identified key written before user id and properties joined it. */
  private migrateEntry(set: MarkerSet, entry: string): string {
    if (set !== this.identified) return entry;
    return entry.split(":").length === 2 ? `${entry}::` : entry;
  }

  /**
   * The stored timestamp, or 0 when it is missing or unusable. A future
   * timestamp is clamped to now: a clock set forward and then corrected
   * must not keep a marker alive past its day.
   */
  private readTimestamp(set: MarkerSet): number {
    const raw = storage().get(set.atKey);
    const parsed = raw ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    const now = Date.now();
    if (parsed > now) {
      storage().set(set.atKey, String(now));
      return now;
    }
    return parsed;
  }

  private saveSet(set: MarkerSet): void {
    try {
      // Every write renews the day, as each write of the web cookie does.
      set.at = Date.now();
      storage().set(set.atKey, String(set.at));
      storage().set(set.key, JSON.stringify(Array.from(set.entries)));
    } catch (error) {
      logger.debug("Session: Failed to save to storage", error);
    }
  }

  private addEntry(set: MarkerSet, entry: string): void {
    set.entries.add(entry);
    for (const oldest of set.entries) {
      if (set.entries.size <= MAX_MARKER_ENTRIES) break;
      set.entries.delete(oldest);
    }
    this.saveSet(set);
  }

  /** Drop the set once a day has passed since its last write. */
  private expireIfStale(set: MarkerSet): void {
    if (!set.at) return;
    const now = Date.now();
    if (set.at > now) {
      set.at = now;
      storage().set(set.atKey, String(now));
      return;
    }
    if (now - set.at > WALLET_MARKER_TTL_MS) {
      this.dropSet(set);
    }
  }

  private dropSet(set: MarkerSet): void {
    set.entries.clear();
    set.at = 0;
    storage().remove(set.key);
    storage().remove(set.atKey);
  }

  /**
   * Check if a wallet has been detected in this session
   */
  public isWalletDetected(rdns: string): boolean {
    this.expireIfStale(this.detected);
    return this.detected.entries.has(rdns);
  }

  /**
   * Mark a wallet as detected
   */
  public markWalletDetected(rdns: string): void {
    this.expireIfStale(this.detected);
    if (this.detected.entries.has(rdns)) return;
    this.addEntry(this.detected, rdns);
  }

  /**
   * The dedup key names the wallet, the user id and the properties, so an
   * identify that changes any of them is sent again. The prefix names the
   * wallet alone; marking replaces that wallet's earlier entries.
   */
  private buildIdentificationKey(
    address: string,
    rdns: string,
    userId?: string,
    properties?: IFormoEventProperties
  ): { key: string; prefix: string } {
    const prefix = `${address.toLowerCase()}:${rdns}`;
    const key = `${prefix}:${userId ?? ""}:${fingerprintProperties(properties)}`;
    return { key, prefix };
  }

  /**
   * Check if a wallet + address + user + properties combination has been
   * identified
   */
  public isWalletIdentified(
    address: string,
    rdns: string,
    userId?: string,
    properties?: IFormoEventProperties
  ): boolean {
    this.expireIfStale(this.identified);
    const { key } = this.buildIdentificationKey(address, rdns, userId, properties);
    return this.identified.entries.has(key);
  }

  /**
   * Mark a wallet + address + user + properties combination as identified
   */
  public markWalletIdentified(
    address: string,
    rdns: string,
    userId?: string,
    properties?: IFormoEventProperties
  ): void {
    this.expireIfStale(this.identified);
    const { key, prefix } = this.buildIdentificationKey(
      address,
      rdns,
      userId,
      properties
    );
    if (this.identified.entries.has(key)) return;
    // Keep only the wallet's latest state. Otherwise a profile that reverts
    // to an earlier value would match the stale entry and send nothing.
    for (const entry of this.identified.entries) {
      if (entry === prefix || entry.startsWith(`${prefix}:`)) {
        this.identified.entries.delete(entry);
      }
    }
    this.addEntry(this.identified, key);
  }

  /**
   * Forget which wallets were identified, so a login after a logout
   * identifies again. The detect markers stay: the wallets are still known.
   */
  public clearIdentified(): void {
    this.dropSet(this.identified);
  }

  /**
   * Clear all session data
   */
  public clear(): void {
    this.dropSet(this.detected);
    this.dropSet(this.identified);
  }
}
