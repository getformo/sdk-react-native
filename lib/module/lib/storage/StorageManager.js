import { logger } from "../logger";
import AsyncStorageAdapter from "./AsyncStorageAdapter";
import MemoryStorage from "./MemoryStorage";
/**
 * Storage manager for React Native SDK
 * Uses AsyncStorage as primary storage with MemoryStorage fallback
 */
export class StorageManager {
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
    const adapter = new AsyncStorageAdapter(this.writeKey);
    await adapter.initialize(asyncStorage);
    this.storages.set("asyncStorage", adapter);
    logger.debug("StorageManager: Initialized with AsyncStorage");
  }

  /**
   * Get storage instance by type
   */
  getStorage(type) {
    if (!this.storages.has(type)) {
      const storage = this.createStorage(type);

      // If storage is not available, fallback to memory and cache the fallback
      if (!storage.isAvailable() && type !== "memoryStorage") {
        logger.warn(`Storage ${type} is not available, falling back to memoryStorage`);
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
        return new AsyncStorageAdapter(this.writeKey);
      case "memoryStorage":
      default:
        return new MemoryStorage(this.writeKey);
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
let storageManagerInstance = null;

/**
 * Initialize global storage manager
 */
export function initStorageManager(writeKey) {
  if (!storageManagerInstance || storageManagerInstance["writeKey"] !== writeKey) {
    storageManagerInstance = new StorageManager(writeKey);
  }
  return storageManagerInstance;
}

/**
 * Get global storage manager instance
 */
export function getStorageManager() {
  return storageManagerInstance;
}

/**
 * Get primary storage
 */
export function storage() {
  if (!storageManagerInstance) {
    throw new Error("StorageManager not initialized. Call initStorageManager first.");
  }
  return storageManagerInstance.getPrimaryStorage();
}
//# sourceMappingURL=StorageManager.js.map