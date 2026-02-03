import StorageBlueprint from "./StorageBlueprint";
/**
 * In-memory storage fallback
 * Data is lost when the app is closed
 */
declare class MemoryStorage extends StorageBlueprint {
    private storage;
    isAvailable(): boolean;
    get(key: string): string | null;
    getAsync(key: string): Promise<string | null>;
    set(key: string, value: string): void;
    setAsync(key: string, value: string): Promise<void>;
    remove(key: string): void;
    removeAsync(key: string): Promise<void>;
    clear(): void;
}
export default MemoryStorage;
//# sourceMappingURL=MemoryStorage.d.ts.map