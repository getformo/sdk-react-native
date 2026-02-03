import StorageBlueprint from "./StorageBlueprint";
import { AsyncStorageInterface } from "./types";
/**
 * AsyncStorage adapter for React Native
 * Provides persistent storage across app restarts
 */
declare class AsyncStorageAdapter extends StorageBlueprint {
    private asyncStorage;
    private cache;
    constructor(writeKey: string, asyncStorage?: AsyncStorageInterface);
    /**
     * Initialize with AsyncStorage instance and preload all Formo keys
     * This ensures consent flags and other critical data are available synchronously
     */
    initialize(asyncStorage: AsyncStorageInterface): Promise<void>;
    isAvailable(): boolean;
    /**
     * Synchronous get from cache (may return stale data)
     * Use getAsync for guaranteed fresh data
     */
    get(key: string): string | null;
    /**
     * Async get from storage
     */
    getAsync(key: string): Promise<string | null>;
    /**
     * Synchronous set (writes to cache immediately, persists async)
     */
    set(key: string, value: string): void;
    /**
     * Async set to storage
     */
    setAsync(key: string, value: string): Promise<void>;
    /**
     * Synchronous remove (removes from cache immediately, persists async)
     */
    remove(key: string): void;
    /**
     * Async remove from storage
     */
    removeAsync(key: string): Promise<void>;
    /**
     * Clear all cached data
     */
    clearCache(): void;
}
export default AsyncStorageAdapter;
//# sourceMappingURL=AsyncStorageAdapter.d.ts.map