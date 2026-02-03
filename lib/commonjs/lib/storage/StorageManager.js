"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StorageManager = void 0;
exports.getStorageManager = getStorageManager;
exports.initStorageManager = initStorageManager;
exports.storage = storage;
var _logger = require("../logger");
var _AsyncStorageAdapter = _interopRequireDefault(require("./AsyncStorageAdapter"));
var _MemoryStorage = _interopRequireDefault(require("./MemoryStorage"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Storage manager for React Native SDK
 * Uses AsyncStorage as primary storage with MemoryStorage fallback
 */
class StorageManager {
  storages = new Map();
  constructor(writeKey) {
    this.writeKey = writeKey;
  }

  /**
   * Initialize with AsyncStorage instance
   * This should be called during SDK initialization
   */
  async initialize(asyncStorage) {
    // Create and initialize the AsyncStorage adapter directly.
    // We bypass getStorage() here because it checks isAvailable() which
    // returns false on an uninitialized adapter and would fall back to
    // MemoryStorage, causing a crash when we call adapter.initialize().
    const adapter = new _AsyncStorageAdapter.default(this.writeKey);
    await adapter.initialize(asyncStorage);
    this.storages.set("asyncStorage", adapter);
    _logger.logger.debug("StorageManager: Initialized with AsyncStorage");
  }

  /**
   * Get storage instance by type
   */
  getStorage(type) {
    if (!this.storages.has(type)) {
      const storage = this.createStorage(type);

      // If storage is not available, fallback to memory and cache the fallback
      if (!storage.isAvailable() && type !== "memoryStorage") {
        _logger.logger.warn(`Storage ${type} is not available, falling back to memoryStorage`);
        const fallback = this.getStorage("memoryStorage");
        this.storages.set(type, fallback);
        return fallback;
      }
      this.storages.set(type, storage);
    }
    return this.storages.get(type);
  }

  /**
   * Create storage instance
   */
  createStorage(type) {
    switch (type) {
      case "asyncStorage":
        return new _AsyncStorageAdapter.default(this.writeKey);
      case "memoryStorage":
      default:
        return new _MemoryStorage.default(this.writeKey);
    }
  }

  /**
   * Get primary storage (AsyncStorage with fallback)
   */
  getPrimaryStorage() {
    const asyncStorage = this.getStorage("asyncStorage");
    if (asyncStorage.isAvailable()) {
      return asyncStorage;
    }
    return this.getStorage("memoryStorage");
  }
}

// Global storage manager instance
exports.StorageManager = StorageManager;
let storageManagerInstance = null;

/**
 * Initialize global storage manager
 */
function initStorageManager(writeKey) {
  if (!storageManagerInstance || storageManagerInstance["writeKey"] !== writeKey) {
    // Clean up old instance before creating new one
    if (storageManagerInstance) {
      _logger.logger.debug("StorageManager: Replacing instance with new writeKey");
    }
    storageManagerInstance = new StorageManager(writeKey);
  }
  return storageManagerInstance;
}

/**
 * Get global storage manager instance
 */
function getStorageManager() {
  return storageManagerInstance;
}

/**
 * Get primary storage
 */
function storage() {
  if (!storageManagerInstance) {
    throw new Error("StorageManager not initialized. Call initStorageManager first.");
  }
  return storageManagerInstance.getPrimaryStorage();
}
//# sourceMappingURL=StorageManager.js.map