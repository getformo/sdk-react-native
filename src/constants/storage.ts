// Storage keys for React Native SDK
export const STORAGE_PREFIX = "formo_rn_";

// Local storage keys (persistent)
export const LOCAL_ANONYMOUS_ID_KEY = "anonymous_id";
export const LOCAL_APP_VERSION_KEY = "app_version";
export const LOCAL_APP_BUILD_KEY = "app_build";
// Session identifier + last-activity marker. Persisted so a session survives an
// app restart, but expires after SESSION_TIMEOUT_MS of inactivity (see EventFactory).
export const LOCAL_SESSION_ID_KEY = "session_id";
export const LOCAL_SESSION_LAST_ACTIVITY_KEY = "session_last_activity";
// One-shot flag: set once the Android Play Install Referrer attribution has
// been fetched, so we never call the native API again.
export const LOCAL_INSTALL_REFERRER_RESOLVED_KEY = "install_referrer_resolved";

// Session storage keys (cleared on app restart)
export const SESSION_USER_ID_KEY = "user_id";
export const SESSION_TRAFFIC_SOURCE_KEY = "traffic_source";
export const SESSION_WALLET_DETECTED_KEY = "wallet_detected";
/** When the wallet markers were last written; they expire a day later, as on web. */
export const SESSION_WALLET_MARKED_AT_KEY = "wallet_marked_at";
/** Wallet markers live a day, the lifetime of the web SDK's marker cookie. */
export const WALLET_MARKER_TTL_MS = 24 * 60 * 60 * 1000;
export const SESSION_WALLET_IDENTIFIED_KEY = "wallet_identified";

// Consent keys
export const CONSENT_OPT_OUT_KEY = "opt_out_tracking";
