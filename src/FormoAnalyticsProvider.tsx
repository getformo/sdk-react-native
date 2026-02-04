import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  FC,
} from "react";
import { FormoAnalytics } from "./FormoAnalytics";
import { initStorageManager, AsyncStorageInterface } from "./lib/storage";
import { logger } from "./lib/logger";
import { FormoAnalyticsProviderProps, IFormoAnalytics } from "./types";

// Default context with no-op methods
const defaultContext: IFormoAnalytics = {
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
  hasOptedOutTracking: () => false,
};

export const FormoAnalyticsContext =
  createContext<IFormoAnalytics>(defaultContext);

export interface FormoAnalyticsProviderPropsWithStorage
  extends FormoAnalyticsProviderProps {
  /**
   * AsyncStorage instance from @react-native-async-storage/async-storage
   * Required for persistent storage
   */
  asyncStorage?: AsyncStorageInterface;
  /**
   * Callback when SDK is ready
   * Note: Use useCallback to avoid re-initialization on every render
   */
  onReady?: (sdk: IFormoAnalytics) => void;
  /**
   * Callback when SDK initialization fails
   * Note: Use useCallback to avoid re-initialization on every render
   */
  onError?: (error: Error) => void;
}

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
export const FormoAnalyticsProvider: FC<FormoAnalyticsProviderPropsWithStorage> = (
  props
) => {
  const { writeKey, disabled = false, children } = props;

  if (!writeKey) {
    logger.error("FormoAnalyticsProvider: No Write Key provided");
    return (
      <FormoAnalyticsContext.Provider value={defaultContext}>
        {children}
      </FormoAnalyticsContext.Provider>
    );
  }

  if (disabled) {
    logger.warn("FormoAnalytics is disabled");
    return (
      <FormoAnalyticsContext.Provider value={defaultContext}>
        {children}
      </FormoAnalyticsContext.Provider>
    );
  }

  return <InitializedAnalytics {...props} />;
};

const InitializedAnalytics: FC<FormoAnalyticsProviderPropsWithStorage> = ({
  writeKey,
  options,
  asyncStorage,
  onReady,
  onError,
  children,
}) => {
  const [sdk, setSdk] = useState<IFormoAnalytics>(defaultContext);
  const sdkRef = useRef<IFormoAnalytics>(defaultContext);
  const storageInitKeyRef = useRef<string | null>(null);
  const cleanupPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const initializationIdRef = useRef<number>(0);

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
      hasReady,
    };

    try {
      return JSON.stringify(serializableOptions);
    } catch (error) {
      logger.warn("Failed to serialize options, using timestamp", error);
      return Date.now().toString();
    }
  }, [tracking, autocapture, apiHost, flushAt, flushInterval, retryCount, maxQueueSize, loggerOption, app, hasReady]);

  useEffect(() => {
    // Increment initialization ID to track which initialization is current
    const currentInitId = ++initializationIdRef.current;
    let isCleanedUp = false;

    const initialize = async () => {
      // Wait for any pending cleanup to complete before re-initializing
      // This prevents race conditions between cleanup and init
      await cleanupPromiseRef.current;

      // Check if this initialization is still current after awaiting cleanup
      if (currentInitId !== initializationIdRef.current || isCleanedUp) {
        logger.debug("Skipping stale initialization");
        return;
      }

      // Clean up existing SDK and await flush completion
      if (sdkRef.current && sdkRef.current !== defaultContext) {
        logger.log("Cleaning up existing FormoAnalytics SDK instance");
        const cleanup = sdkRef.current.cleanup();
        cleanupPromiseRef.current = cleanup;
        await cleanup;
        sdkRef.current = defaultContext;
        setSdk(defaultContext);
      }

      // Check again after cleanup
      if (currentInitId !== initializationIdRef.current || isCleanedUp) {
        logger.debug("Skipping stale initialization after cleanup");
        return;
      }

      try {
        // Use optionsRef.current to ensure we have the latest options
        const sdkInstance = await FormoAnalytics.init(
          writeKey,
          optionsRef.current,
          asyncStorage
        );

        // Verify this initialization is still current
        if (currentInitId !== initializationIdRef.current || isCleanedUp) {
          logger.log("Initialization superseded, cleaning up new instance");
          await sdkInstance.cleanup();
          return;
        }

        setSdk(sdkInstance);
        sdkRef.current = sdkInstance;
        logger.log("Successfully initialized FormoAnalytics SDK");

        // Call onReady callback using the ref (stable reference)
        onReadyRef.current?.(sdkInstance);
      } catch (error) {
        if (currentInitId === initializationIdRef.current && !isCleanedUp) {
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
        // Store cleanup promise so next initialization can await it
        const cleanup = sdkRef.current.cleanup().catch((error) => {
          logger.error("Error during SDK cleanup:", error);
        });
        cleanupPromiseRef.current = cleanup;
        sdkRef.current = defaultContext;
      }
    };
    // Note: onReady and onError are NOT in the dependency array
    // They are accessed via refs to prevent re-initialization
    // wagmiConfig and wagmiQueryClient are tracked separately since they're not serializable
  }, [writeKey, optionsKey, asyncStorage, wagmiConfig, wagmiQueryClient]);

  return (
    <FormoAnalyticsContext.Provider value={sdk}>
      {children}
    </FormoAnalyticsContext.Provider>
  );
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
// Track if the useFormo warning has been logged to avoid console spam
let hasLoggedUseFormoWarning = false;

export const useFormo = (): IFormoAnalytics => {
  const context = useContext(FormoAnalyticsContext);

  // Check if SDK has been initialized (context will be defaultContext before init completes)
  // Only log the warning once to avoid flooding the console during async initialization
  if (context === defaultContext && !hasLoggedUseFormoWarning) {
    hasLoggedUseFormoWarning = true;
    logger.warn(
      "useFormo called before SDK initialization complete. " +
        "Ensure FormoAnalyticsProvider is mounted and writeKey is provided."
    );
  }

  // Reset the warning flag when SDK is initialized so it can warn again after a reset
  if (context !== defaultContext) {
    hasLoggedUseFormoWarning = false;
  }

  return context;
};
