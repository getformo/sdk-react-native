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
  /** Rewrites an entry written by an earlier version, on load. */
  migrate?: (entry: string) => string;
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
    // An identified key written before user id and properties joined it.
    migrate: (entry) => (entry.split(":").length === 2 ? `${entry}::` : entry),
  };

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load session state from storage
   */
  private loadFromStorage(): void {
    try {
      // A version that shared one expiry between both sets.
      const legacyAtRaw = storage().get(LEGACY_WALLET_MARKED_AT_KEY);
      const legacyAt = legacyAtRaw ? parseInt(legacyAtRaw, 10) : 0;
      if (legacyAtRaw) storage().remove(LEGACY_WALLET_MARKED_AT_KEY);
      this.loadSet(this.detected, legacyAt);
      this.loadSet(this.identified, legacyAt);
    } catch (error) {
      logger.debug("Session: Failed to load from storage", error);
    }
  }

  private loadSet(set: MarkerSet, legacyAt = 0): void {
    const raw = storage().get(set.key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as string[];
    const kept = parsed.slice(-MAX_MARKER_ENTRIES);
    set.entries = new Set(set.migrate ? kept.map(set.migrate) : kept);
    if (set.entries.size === 0) return;
    // A truncated or migrated set is written back, or every cold start
    // would load the legacy value again.
    const migrated = Array.from(set.entries);
    if (migrated.length !== parsed.length || migrated.some((e, i) => e !== parsed[i])) {
      storage().set(set.key, JSON.stringify(migrated));
    }
    set.at = this.readTimestamp(set);
    if (!set.at) {
      // Markers written by a version without a per-set timestamp keep the
      // shared one if there was one, else get their day from now; either
      // way they expire.
      set.at = legacyAt > 0 ? Math.min(legacyAt, Date.now()) : Date.now();
      storage().set(set.atKey, String(set.at));
    }
    this.expireIfStale(set);
  }

  /** The stored timestamp, or 0 when it is missing or unusable. */
  private readTimestamp(set: MarkerSet): number {
    const raw = storage().get(set.atKey);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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

  private hasEntry(set: MarkerSet, entry: string): boolean {
    this.expireIfStale(set);
    return set.entries.has(entry);
  }

  /**
   * Add an entry unless it is already there. With `supersede`, the entries
   * that start with it go first: the new entry replaces their state.
   */
  private markEntry(set: MarkerSet, entry: string, supersede?: string): void {
    if (this.hasEntry(set, entry)) return;
    if (supersede !== undefined) {
      for (const old of set.entries) {
        if (old.startsWith(supersede)) set.entries.delete(old);
      }
    }
    set.entries.add(entry);
    for (const oldest of set.entries) {
      if (set.entries.size <= MAX_MARKER_ENTRIES) break;
      set.entries.delete(oldest);
    }
    this.saveSet(set);
  }

  /**
   * Drop the set once a day has passed since its last write. A future
   * timestamp is clamped to now: a clock set forward and then corrected
   * must not keep a marker alive past its day.
   */
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
    return this.hasEntry(this.detected, rdns);
  }

  /**
   * Mark a wallet as detected
   */
  public markWalletDetected(rdns: string): void {
    this.markEntry(this.detected, rdns);
  }

  /**
   * The dedup key names the wallet, the user id and the properties, so an
   * identify that changes any of them is sent again. The prefix names the
   * wallet-user; marking replaces that wallet-user's earlier state, as on
   * web, so dedup means "the same as this wallet-user's last identify".
   */
  private buildIdentificationKey(
    address: string,
    rdns: string,
    userId?: string,
    properties?: IFormoEventProperties
  ): { key: string; prefix: string } {
    // The user id is escaped so a ":" inside it cannot read as a delimiter.
    // A plain replace, total over every string, unlike encodeURIComponent.
    const safeUser = userId === undefined ? "" : userId.replace(/%/g, "%25").replace(/:/g, "%3A");
    const prefix = `${address.toLowerCase()}:${rdns}:${safeUser}`;
    const key = `${prefix}:${fingerprintProperties(properties)}`;
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
    const { key } = this.buildIdentificationKey(address, rdns, userId, properties);
    return this.hasEntry(this.identified, key);
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
    const { key, prefix } = this.buildIdentificationKey(address, rdns, userId, properties);
    // Keep only the wallet-user's latest state. Otherwise a profile that
    // reverts to an earlier value would match the stale entry and send nothing.
    this.markEntry(this.identified, key, `${prefix}:`);
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
