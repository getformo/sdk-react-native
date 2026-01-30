"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _constants = require("../../constants");
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
    return `${_constants.STORAGE_PREFIX}${this.writeKey}_${key}`;
  }
}
var _default = exports.default = StorageBlueprint;
//# sourceMappingURL=StorageBlueprint.js.map