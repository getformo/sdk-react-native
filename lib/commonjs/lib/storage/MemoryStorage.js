"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _StorageBlueprint = _interopRequireDefault(require("./StorageBlueprint"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * In-memory storage fallback
 * Data is lost when the app is closed
 */
class MemoryStorage extends _StorageBlueprint.default {
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
var _default = exports.default = MemoryStorage;
//# sourceMappingURL=MemoryStorage.js.map