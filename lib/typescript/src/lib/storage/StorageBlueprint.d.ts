import { IStorage } from "./types";
/**
 * Base storage class with key prefixing
 */
declare abstract class StorageBlueprint implements IStorage {
    protected writeKey: string;
    constructor(writeKey: string);
    /**
     * Generate storage key with prefix
     */
    getKey(key: string): string;
    abstract isAvailable(): boolean;
    abstract get(key: string): string | null;
    abstract getAsync(key: string): Promise<string | null>;
    abstract set(key: string, value: string): void;
    abstract setAsync(key: string, value: string): Promise<void>;
    abstract remove(key: string): void;
    abstract removeAsync(key: string): Promise<void>;
}
export default StorageBlueprint;
//# sourceMappingURL=StorageBlueprint.d.ts.map