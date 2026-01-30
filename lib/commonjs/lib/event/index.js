"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _EventFactory = require("./EventFactory");
Object.keys(_EventFactory).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _EventFactory[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _EventFactory[key];
    }
  });
});
var _EventManager = require("./EventManager");
Object.keys(_EventManager).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _EventManager[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _EventManager[key];
    }
  });
});
var _EventQueue = require("./EventQueue");
Object.keys(_EventQueue).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _EventQueue[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _EventQueue[key];
    }
  });
});
var _types = require("./types");
Object.keys(_types).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _types[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _types[key];
    }
  });
});
//# sourceMappingURL=index.js.map