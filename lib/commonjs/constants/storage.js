"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.STORAGE_PREFIX = exports.SESSION_WALLET_IDENTIFIED_KEY = exports.SESSION_WALLET_DETECTED_KEY = exports.SESSION_USER_ID_KEY = exports.SESSION_TRAFFIC_SOURCE_KEY = exports.LOCAL_ANONYMOUS_ID_KEY = exports.CONSENT_OPT_OUT_KEY = void 0;
// Storage keys for React Native SDK
const STORAGE_PREFIX = exports.STORAGE_PREFIX = "formo_rn_";

// Local storage keys (persistent)
const LOCAL_ANONYMOUS_ID_KEY = exports.LOCAL_ANONYMOUS_ID_KEY = "anonymous_id";

// Session storage keys (cleared on app restart)
const SESSION_USER_ID_KEY = exports.SESSION_USER_ID_KEY = "user_id";
const SESSION_TRAFFIC_SOURCE_KEY = exports.SESSION_TRAFFIC_SOURCE_KEY = "traffic_source";
const SESSION_WALLET_DETECTED_KEY = exports.SESSION_WALLET_DETECTED_KEY = "wallet_detected";
const SESSION_WALLET_IDENTIFIED_KEY = exports.SESSION_WALLET_IDENTIFIED_KEY = "wallet_identified";

// Consent keys
const CONSENT_OPT_OUT_KEY = exports.CONSENT_OPT_OUT_KEY = "opt_out_tracking";
//# sourceMappingURL=storage.js.map