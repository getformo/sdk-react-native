"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _StorageBlueprint = _interopRequireDefault(require("./StorageBlueprint"));
var _logger = require("../logger");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * AsyncStorage adapter for React Native
 * Provides persistent storage across app restarts
 */
class AsyncStorageAdapter extends _StorageBlueprint.default {
  asyncStorage = null;
  cache = new Map();
  constructor(writeKey, asyncStorage) {
    super(writeKey);
    if (asyncStorage) {
      this.asyncStorage = asyncStorage;
    }
  }

  /**
   * Initialize with AsyncStorage instance and preload all Formo keys
   * This ensures consent flags and other critical data are available synchronously
   */
  async initialize(asyncStorage) {
    this.asyncStorage = asyncStorage;

    // Preload all Formo keys into cache for synchronous access
    // This is critical for consent checks on cold start (GDPR compliance)
    try {
      const allKeys = await asyncStorage.getAllKeys();
      // getKey("") returns "formo_rn_{writeKey}_" - use this exact prefix
      // to avoid matching keys from other instances (e.g., "abc" matching "abc123")
      const formoPrefix = this.getKey("");

      // Filter to only our keys (exact prefix match including trailing underscore)
      const formoKeys = allKeys.filter(key => key.startsWith(formoPrefix));
      if (formoKeys.length > 0) {
        const pairs = await asyncStorage.multiGet(formoKeys);
        for (const [key, value] of pairs) {
          if (value !== null) {
            this.cache.set(key, value);
          }
        }
        _logger.logger.debug(`AsyncStorageAdapter: Preloaded ${formoKeys.length} keys into cache`);
      }
    } catch (error) {
      _logger.logger.error("AsyncStorageAdapter: Failed to preload keys", error);
    }
    _logger.logger.debug("AsyncStorageAdapter: Initialized");
  }
  isAvailable() {
    return this.asyncStorage !== null;
  }

  /**
   * Synchronous get from cache (may return stale data)
   * Use getAsync for guaranteed fresh data
   */
  get(key) {
    const cachedValue = this.cache.get(this.getKey(key));
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    // Trigger async fetch to populate cache
    this.getAsync(key).catch(() => {
      // Ignore errors in background fetch
    });
    return null;
  }

  /**
   * Async get from storage
   */
  async getAsync(key) {
    if (!this.asyncStorage) {
      return this.cache.get(this.getKey(key)) ?? null;
    }
    try {
      const fullKey = this.getKey(key);
      const value = await this.asyncStorage.getItem(fullKey);
      if (value !== null) {
        this.cache.set(fullKey, value);
      }
      return value;
    } catch (error) {
      _logger.logger.error("AsyncStorageAdapter: Failed to get item", error);
      return this.cache.get(this.getKey(key)) ?? null;
    }
  }

  /**
   * Synchronous set (writes to cache immediately, persists async)
   */
  set(key, value) {
    const fullKey = this.getKey(key);
    this.cache.set(fullKey, value);

    // Persist asynchronously
    this.setAsync(key, value).catch(error => {
      _logger.logger.error("AsyncStorageAdapter: Failed to persist item", error);
    });
  }

  /**
   * Async set to storage
   */
  async setAsync(key, value) {
    const fullKey = this.getKey(key);
    this.cache.set(fullKey, value);
    if (!this.asyncStorage) {
      return;
    }
    try {
      await this.asyncStorage.setItem(fullKey, value);
    } catch (error) {
      _logger.logger.error("AsyncStorageAdapter: Failed to set item", error);
      throw error;
    }
  }

  /**
   * Synchronous remove (removes from cache immediately, persists async)
   */
  remove(key) {
    const fullKey = this.getKey(key);
    this.cache.delete(fullKey);

    // Persist asynchronously
    this.removeAsync(key).catch(error => {
      _logger.logger.error("AsyncStorageAdapter: Failed to remove item", error);
    });
  }

  /**
   * Async remove from storage
   */
  async removeAsync(key) {
    const fullKey = this.getKey(key);
    this.cache.delete(fullKey);
    if (!this.asyncStorage) {
      return;
    }
    try {
      await this.asyncStorage.removeItem(fullKey);
    } catch (error) {
      _logger.logger.error("AsyncStorageAdapter: Failed to remove item", error);
      throw error;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
  }
}
var _default = exports.default = AsyncStorageAdapter;
//# sourceMappingURL=AsyncStorageAdapter.js.map