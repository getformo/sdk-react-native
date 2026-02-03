"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useFormo = exports.FormoAnalyticsProvider = exports.FormoAnalyticsContext = void 0;
var _react = _interopRequireWildcard(require("react"));
var _FormoAnalytics = require("./FormoAnalytics");
var _storage = require("./lib/storage");
var _logger = require("./lib/logger");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
// Default context with no-op methods
const defaultContext = {
  chain: () => Promise.resolve(),
  screen: () => Promise.resolve(),
  reset: () => {},
  cleanup: () => Promise.resolve(),
  detect: () => Promise.resolve(),
  connect: () => Promise.resolve(),
  disconnect: () => Promise.resolve(),
  signature: () => Promise.resolve(),
  transaction: () => Promise.resolve(),
  identify: () => Promise.resolve(),
  track: () => Promise.resolve(),
  setTrafficSourceFromUrl: () => {},
  optOutTracking: () => {},
  optInTracking: () => {},
  hasOptedOutTracking: () => false
};
const FormoAnalyticsContext = exports.FormoAnalyticsContext = /*#__PURE__*/(0, _react.createContext)(defaultContext);
/**
 * Formo Analytics Provider for React Native
 *
 * Wraps your app to provide analytics context
 *
 * @example
 * ```tsx
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import { FormoAnalyticsProvider } from '@formo/react-native-analytics';
 *
 * function App() {
 *   return (
 *     <FormoAnalyticsProvider
 *       writeKey="your-write-key"
 *       asyncStorage={AsyncStorage}
 *       options={{ wagmi: { config, queryClient } }}
 *     >
 *       <YourApp />
 *     </FormoAnalyticsProvider>
 *   );
 * }
 * ```
 */
const FormoAnalyticsProvider = props => {
  const {
    writeKey,
    disabled = false,
    children
  } = props;
  if (!writeKey) {
    _logger.logger.error("FormoAnalyticsProvider: No Write Key provided");
    return /*#__PURE__*/_react.default.createElement(_react.default.Fragment, null, children);
  }
  if (disabled) {
    _logger.logger.warn("FormoAnalytics is disabled");
    return /*#__PURE__*/_react.default.createElement(_react.default.Fragment, null, children);
  }
  return /*#__PURE__*/_react.default.createElement(InitializedAnalytics, props);
};
exports.FormoAnalyticsProvider = FormoAnalyticsProvider;
const InitializedAnalytics = ({
  writeKey,
  options,
  asyncStorage,
  onReady,
  onError,
  children
}) => {
  const [sdk, setSdk] = (0, _react.useState)(defaultContext);
  const sdkRef = (0, _react.useRef)(defaultContext);
  const storageInitKeyRef = (0, _react.useRef)(null);

  // Only initialize storage manager when writeKey changes, not on every render
  if (storageInitKeyRef.current !== writeKey) {
    (0, _storage.initStorageManager)(writeKey);
    storageInitKeyRef.current = writeKey;
  }

  // Store callbacks and options in refs to avoid re-initialization when references change
  // This fixes the issue where inline arrow functions cause repeated SDK init
  const onReadyRef = (0, _react.useRef)(onReady);
  const onErrorRef = (0, _react.useRef)(onError);
  const optionsRef = (0, _react.useRef)(options);

  // Update refs when values change (without triggering effect)
  (0, _react.useEffect)(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  (0, _react.useEffect)(() => {
    onErrorRef.current = onError;
  }, [onError]);
  (0, _react.useEffect)(() => {
    optionsRef.current = options;
  }, [options]);

  // Extract individual option values to avoid reference equality issues with options object
  const tracking = options?.tracking;
  const autocapture = options?.autocapture;
  const apiHost = options?.apiHost;
  const flushAt = options?.flushAt;
  const flushInterval = options?.flushInterval;
  const retryCount = options?.retryCount;
  const maxQueueSize = options?.maxQueueSize;
  const loggerOption = options?.logger;
  const app = options?.app;
  const hasReady = !!options?.ready;
  const wagmiConfig = options?.wagmi?.config;
  const wagmiQueryClient = options?.wagmi?.queryClient;

  // Create stable key from serializable options
  const optionsKey = (0, _react.useMemo)(() => {
    const serializableOptions = {
      tracking,
      autocapture,
      apiHost,
      flushAt,
      flushInterval,
      retryCount,
      maxQueueSize,
      logger: loggerOption,
      app,
      hasReady
    };
    try {
      return JSON.stringify(serializableOptions);
    } catch (error) {
      _logger.logger.warn("Failed to serialize options, using timestamp", error);
      return Date.now().toString();
    }
  }, [tracking, autocapture, apiHost, flushAt, flushInterval, retryCount, maxQueueSize, loggerOption, app, hasReady]);
  (0, _react.useEffect)(() => {
    let isCleanedUp = false;
    const initialize = async () => {
      // Clean up existing SDK and await flush completion
      if (sdkRef.current && sdkRef.current !== defaultContext) {
        _logger.logger.log("Cleaning up existing FormoAnalytics SDK instance");
        await sdkRef.current.cleanup();
        sdkRef.current = defaultContext;
        setSdk(defaultContext);
      }
      try {
        // Use optionsRef.current to ensure we have the latest options
        const sdkInstance = await _FormoAnalytics.FormoAnalytics.init(writeKey, optionsRef.current, asyncStorage);
        if (!isCleanedUp) {
          setSdk(sdkInstance);
          sdkRef.current = sdkInstance;
          _logger.logger.log("Successfully initialized FormoAnalytics SDK");

          // Call onReady callback using the ref (stable reference)
          onReadyRef.current?.(sdkInstance);
        } else {
          _logger.logger.log("Component unmounted during initialization, cleaning up");
          await sdkInstance.cleanup();
        }
      } catch (error) {
        if (!isCleanedUp) {
          _logger.logger.error("Failed to initialize FormoAnalytics SDK", error);
          // Call onError callback using the ref (stable reference)
          onErrorRef.current?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };
    initialize();
    return () => {
      isCleanedUp = true;
      if (sdkRef.current && sdkRef.current !== defaultContext) {
        _logger.logger.log("Cleaning up FormoAnalytics SDK instance");
        // Note: React cleanup functions cannot be async. We start the cleanup
        // (which flushes pending events) but cannot await it. For re-initialization,
        // cleanup is properly awaited in the initialize function above.
        sdkRef.current.cleanup().catch(error => {
          _logger.logger.error("Error during SDK cleanup:", error);
        });
        sdkRef.current = defaultContext;
      }
    };
    // Note: onReady and onError are NOT in the dependency array
    // They are accessed via refs to prevent re-initialization
    // wagmiConfig and wagmiQueryClient are tracked separately since they're not serializable
  }, [writeKey, optionsKey, asyncStorage, wagmiConfig, wagmiQueryClient]);
  return /*#__PURE__*/_react.default.createElement(FormoAnalyticsContext.Provider, {
    value: sdk
  }, children);
};

/**
 * Hook to access Formo Analytics
 *
 * @example
 * ```tsx
 * import { useFormo } from '@formo/react-native-analytics';
 *
 * function MyScreen() {
 *   const formo = useFormo();
 *
 *   useEffect(() => {
 *     formo.screen('Home');
 *   }, []);
 *
 *   const handleButtonPress = () => {
 *     formo.track('Button Pressed', { buttonName: 'signup' });
 *   };
 *
 *   return <Button onPress={handleButtonPress}>Sign Up</Button>;
 * }
 * ```
 */
const useFormo = () => {
  const context = (0, _react.useContext)(FormoAnalyticsContext);

  // Check if SDK has been initialized (context will be defaultContext before init completes)
  if (context === defaultContext) {
    _logger.logger.warn("useFormo called before SDK initialization complete. " + "Ensure FormoAnalyticsProvider is mounted and writeKey is provided.");
  }
  return context;
};
exports.useFormo = useFormo;
//# sourceMappingURL=FormoAnalyticsProvider.js.map