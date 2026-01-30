import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FormoAnalytics } from "./FormoAnalytics";
import { initStorageManager } from "./lib/storage";
import { logger } from "./lib/logger";
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
  optOutTracking: () => {},
  optInTracking: () => {},
  hasOptedOutTracking: () => false
};
export const FormoAnalyticsContext = /*#__PURE__*/createContext(defaultContext);
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
export const FormoAnalyticsProvider = props => {
  const {
    writeKey,
    disabled = false,
    children
  } = props;
  if (!writeKey) {
    logger.error("FormoAnalyticsProvider: No Write Key provided");
    return /*#__PURE__*/React.createElement(React.Fragment, null, children);
  }
  if (disabled) {
    logger.warn("FormoAnalytics is disabled");
    return /*#__PURE__*/React.createElement(React.Fragment, null, children);
  }
  return /*#__PURE__*/React.createElement(InitializedAnalytics, props);
};
const InitializedAnalytics = ({
  writeKey,
  options,
  asyncStorage,
  onReady,
  onError,
  children
}) => {
  const [sdk, setSdk] = useState(defaultContext);
  const sdkRef = useRef(defaultContext);
  const storageInitKeyRef = useRef(null);

  // Only initialize storage manager when writeKey changes, not on every render
  if (storageInitKeyRef.current !== writeKey) {
    initStorageManager(writeKey);
    storageInitKeyRef.current = writeKey;
  }

  // Store callbacks and options in refs to avoid re-initialization when references change
  // This fixes the issue where inline arrow functions cause repeated SDK init
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const optionsRef = useRef(options);

  // Update refs when values change (without triggering effect)
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
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
  const optionsKey = useMemo(() => {
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
      logger.warn("Failed to serialize options, using timestamp", error);
      return Date.now().toString();
    }
  }, [tracking, autocapture, apiHost, flushAt, flushInterval, retryCount, maxQueueSize, loggerOption, app, hasReady]);
  useEffect(() => {
    let isCleanedUp = false;
    const initialize = async () => {
      // Clean up existing SDK and await flush completion
      if (sdkRef.current && sdkRef.current !== defaultContext) {
        logger.log("Cleaning up existing FormoAnalytics SDK instance");
        await sdkRef.current.cleanup();
        sdkRef.current = defaultContext;
        setSdk(defaultContext);
      }
      try {
        // Use optionsRef.current to ensure we have the latest options
        const sdkInstance = await FormoAnalytics.init(writeKey, optionsRef.current, asyncStorage);
        if (!isCleanedUp) {
          setSdk(sdkInstance);
          sdkRef.current = sdkInstance;
          logger.log("Successfully initialized FormoAnalytics SDK");

          // Call onReady callback using the ref (stable reference)
          onReadyRef.current?.(sdkInstance);
        } else {
          logger.log("Component unmounted during initialization, cleaning up");
          await sdkInstance.cleanup();
        }
      } catch (error) {
        if (!isCleanedUp) {
          logger.error("Failed to initialize FormoAnalytics SDK", error);
          // Call onError callback using the ref (stable reference)
          onErrorRef.current?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };
    initialize();
    return () => {
      isCleanedUp = true;
      if (sdkRef.current && sdkRef.current !== defaultContext) {
        logger.log("Cleaning up FormoAnalytics SDK instance");
        // Note: React cleanup functions cannot be async. We start the cleanup
        // (which flushes pending events) but cannot await it. For re-initialization,
        // cleanup is properly awaited in the initialize function above.
        sdkRef.current.cleanup().catch(error => {
          logger.error("Error during SDK cleanup:", error);
        });
        sdkRef.current = defaultContext;
      }
    };
    // Note: onReady and onError are NOT in the dependency array
    // They are accessed via refs to prevent re-initialization
    // wagmiConfig and wagmiQueryClient are tracked separately since they're not serializable
  }, [writeKey, optionsKey, asyncStorage, wagmiConfig, wagmiQueryClient]);
  return /*#__PURE__*/React.createElement(FormoAnalyticsContext.Provider, {
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
export const useFormo = () => {
  const context = useContext(FormoAnalyticsContext);

  // Check if SDK has been initialized (context will be defaultContext before init completes)
  if (context === defaultContext) {
    logger.warn("useFormo called before SDK initialization complete. " + "Ensure FormoAnalyticsProvider is mounted and writeKey is provided.");
  }
  return context;
};
//# sourceMappingURL=FormoAnalyticsProvider.js.map