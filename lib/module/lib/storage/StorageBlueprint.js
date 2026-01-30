import { STORAGE_PREFIX } from "../../constants";
/**
 * Base storage class with key prefixing
 */
class StorageBlueprint {
  constructor(writeKey) {
    this.writeKey = writeKey;
  }

  /**
   * Generate storage key with prefix
   */
  getKey(key) {
    return `${STORAGE_PREFIX}${this.writeKey}_${key}`;
  }
}
export default StorageBlueprint;
//# sourceMappingURL=StorageBlueprint.js.map