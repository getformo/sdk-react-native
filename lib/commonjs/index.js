"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  FormoAnalytics: true,
  FormoAnalyticsProvider: true,
  FormoAnalyticsContext: true,
  useFormo: true,
  SignatureStatus: true,
  TransactionStatus: true
};
Object.defineProperty(exports, "FormoAnalytics", {
  enumerable: true,
  get: function () {
    return _FormoAnalytics.FormoAnalytics;
  }
});
Object.defineProperty(exports, "FormoAnalyticsContext", {
  enumerable: true,
  get: function () {
    return _FormoAnalyticsProvider.FormoAnalyticsContext;
  }
});
Object.defineProperty(exports, "FormoAnalyticsProvider", {
  enumerable: true,
  get: function () {
    return _FormoAnalyticsProvider.FormoAnalyticsProvider;
  }
});
Object.defineProperty(exports, "SignatureStatus", {
  enumerable: true,
  get: function () {
    return _events.SignatureStatus;
  }
});
Object.defineProperty(exports, "TransactionStatus", {
  enumerable: true,
  get: function () {
    return _events.TransactionStatus;
  }
});
Object.defineProperty(exports, "useFormo", {
  enumerable: true,
  get: function () {
    return _FormoAnalyticsProvider.useFormo;
  }
});
var _FormoAnalytics = require("./FormoAnalytics");
var _FormoAnalyticsProvider = require("./FormoAnalyticsProvider");
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
var _events = require("./types/events");
//# sourceMappingURL=index.js.map