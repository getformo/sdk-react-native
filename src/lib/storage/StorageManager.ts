import { logger } from "../logger";
import AsyncStorageAdapter from "./AsyncStorageAdapter";
import MemoryStorage from "./MemoryStorage";
import { IStorage, StorageType, AsyncStorageInterface } from "./types";

/**
 * Storage manager for React Native SDK
 * Uses AsyncStorage as primary storage with MemoryStorage fallback
 */
export class StorageManager {
  private storages: Map<StorageType, IStorage> = new Map();

  constructor(private readonly writeKey: string) {}

  /**
   * Initialize with AsyncStorage instance
   * This should be called during SDK initialization
   */
  public async initialize(asyncStorage: AsyncStorageInterface): Promise<void> {
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
  public getStorage(type: StorageType): IStorage {
    if (!this.storages.has(type)) {
      const storage = this.createStorage(type);

      // If storage is not available, fallback to memory and cache the fallback
      if (!storage.isAvailable() && type !== "memoryStorage") {
        logger.warn(
          `Storage ${type} is not available, falling back to memoryStorage`
        );
        const fallback = this.getStorage("memoryStorage");
        this.storages.set(type, fallback);
        return fallback;
      }

      this.storages.set(type, storage);
    }

    return this.storages.get(type)!;
  }

  /**
   * Create storage instance
   */
  private createStorage(type: StorageType): IStorage {
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
  public getPrimaryStorage(): IStorage {
    const asyncStorage = this.getStorage("asyncStorage");
    if (asyncStorage.isAvailable()) {
      return asyncStorage;
    }
    return this.getStorage("memoryStorage");
  }

  /**
   * Check if persistent storage (AsyncStorage) has been initialized.
   * Returns false if only MemoryStorage is available.
   */
  public hasPersistentStorage(): boolean {
    const stored = this.storages.get("asyncStorage");
    return stored !== undefined && stored.isAvailable();
  }
}

// Global storage manager instance
let storageManagerInstance: StorageManager | null = null;

/**
 * Initialize global storage manager
 */
export function initStorageManager(writeKey: string): StorageManager {
  if (!storageManagerInstance || storageManagerInstance["writeKey"] !== writeKey) {
    // Clean up old instance before creating new one
    if (storageManagerInstance) {
      logger.debug("StorageManager: Replacing instance with new writeKey");
    }
    storageManagerInstance = new StorageManager(writeKey);
  }
  return storageManagerInstance;
}

/**
 * Get global storage manager instance
 */
export function getStorageManager(): StorageManager | null {
  return storageManagerInstance;
}

/**
 * Get primary storage
 */
export function storage(): IStorage {
  if (!storageManagerInstance) {
    throw new Error("StorageManager not initialized. Call initStorageManager first.");
  }
  return storageManagerInstance.getPrimaryStorage();
}
