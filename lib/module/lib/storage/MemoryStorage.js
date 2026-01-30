import StorageBlueprint from "./StorageBlueprint";

/**
 * In-memory storage fallback
 * Data is lost when the app is closed
 */
class MemoryStorage extends StorageBlueprint {
  storage = new Map();
  isAvailable() {
    return true;
  }
  get(key) {
    return this.storage.get(this.getKey(key)) ?? null;
  }
  async getAsync(key) {
    return this.get(key);
  }
  set(key, value) {
    this.storage.set(this.getKey(key), value);
  }
  async setAsync(key, value) {
    this.set(key, value);
  }
  remove(key) {
    this.storage.delete(this.getKey(key));
  }
  async removeAsync(key) {
    this.remove(key);
  }
  clear() {
    this.storage.clear();
  }
}
export default MemoryStorage;
//# sourceMappingURL=MemoryStorage.js.map