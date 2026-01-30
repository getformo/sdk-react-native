"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  AsyncStorageAdapter: true,
  MemoryStorage: true
};
Object.defineProperty(exports, "AsyncStorageAdapter", {
  enumerable: true,
  get: function () {
    return _AsyncStorageAdapter.default;
  }
});
Object.defineProperty(exports, "MemoryStorage", {
  enumerable: true,
  get: function () {
    return _MemoryStorage.default;
  }
});
var _StorageManager = require("./StorageManager");
Object.keys(_StorageManager).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _StorageManager[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _StorageManager[key];
    }
  });
});
var _types = require("./types");
Object.keys(_types).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _types[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _types[key];
    }
  });
});
var _AsyncStorageAdapter = _interopRequireDefault(require("./AsyncStorageAdapter"));
var _MemoryStorage = _interopRequireDefault(require("./MemoryStorage"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
//# sourceMappingURL=index.js.map