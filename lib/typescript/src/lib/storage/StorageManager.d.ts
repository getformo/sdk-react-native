import { IStorage, StorageType, AsyncStorageInterface } from "./types";
/**
 * Storage manager for React Native SDK
 * Uses AsyncStorage as primary storage with MemoryStorage fallback
 */
export declare class StorageManager {
    private readonly writeKey;
    private storages;
    constructor(writeKey: string);
    /**
     * Initialize with AsyncStorage instance
     * This should be called during SDK initialization
     */
    initialize(asyncStorage: AsyncStorageInterface): Promise<void>;
    /**
     * Get storage instance by type
     */
    getStorage(type: StorageType): IStorage;
    /**
     * Create storage instance
     */
    private createStorage;
    /**
     * Get primary storage (AsyncStorage with fallback)
     */
    getPrimaryStorage(): IStorage;
}
/**
 * Initialize global storage manager
 */
export declare function initStorageManager(writeKey: string): StorageManager;
/**
 * Get global storage manager instance
 */
export declare function getStorageManager(): StorageManager | null;
/**
 * Get primary storage
 */
export declare function storage(): IStorage;
//# sourceMappingURL=StorageManager.d.ts.map