/**
 * FormoAnalytics for React Native
 *
 * Main SDK class for tracking wallet events and user analytics in mobile dApps
 */

import {
  EVENTS_API_HOST,
  EventType,
  LOCAL_ANONYMOUS_ID_KEY,
  SESSION_USER_ID_KEY,
  CONSENT_OPT_OUT_KEY,
  TEventType,
} from "./constants";
import { initStorageManager, storage, AsyncStorageInterface } from "./lib/storage";
import { EventManager, EventQueue, IEventManager } from "./lib/event";
import { logger, Logger } from "./lib/logger";
import {
  setConsentFlag,
  getConsentFlag,
  removeConsentFlag,
} from "./lib/consent";
import { FormoAnalyticsSession } from "./lib/session";
import { WagmiEventHandler } from "./lib/wagmi";
import { AppLifecycleManager } from "./lib/lifecycle";
import {
  Address,
  ChainID,
  Config,
  IFormoAnalytics,
  IFormoEventContext,
  IFormoEventProperties,
  Options,
  SignatureStatus,
  TrackingOptions,
  TransactionStatus,
} from "./types";
import { toChecksumAddress, getValidAddress } from "./utils";
import { parseTrafficSource, storeTrafficSource } from "./utils/trafficSource";

export class FormoAnalytics implements IFormoAnalytics {
  private session: FormoAnalyticsSession;
  private eventManager: IEventManager;
  private eventQueue: EventQueue;
  private wagmiHandler?: WagmiEventHandler;
  private lifecycleManager?: AppLifecycleManager;

  config: Config;
  currentChainId?: ChainID;
  currentAddress?: Address;
  currentUserId?: string = "";

  private constructor(
    public readonly writeKey: string,
    public options: Options = {}
  ) {
    this.config = { writeKey };

    this.session = new FormoAnalyticsSession();
    this.currentUserId =
      (storage().get(SESSION_USER_ID_KEY) as string) || undefined;

    // Bind methods
    this.identify = this.identify.bind(this);
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.chain = this.chain.bind(this);
    this.signature = this.signature.bind(this);
    this.transaction = this.transaction.bind(this);
    this.detect = this.detect.bind(this);
    this.track = this.track.bind(this);
    this.screen = this.screen.bind(this);
    this.isAutocaptureEnabled = this.isAutocaptureEnabled.bind(this);

    // Initialize logger
    Logger.init({
      enabled: options.logger?.enabled || false,
      enabledLevels: options.logger?.levels || [],
    });

    // Initialize event queue
    this.eventQueue = new EventQueue(this.config.writeKey, {
      apiHost: options.apiHost || EVENTS_API_HOST,
      flushAt: options.flushAt,
      retryCount: options.retryCount,
      maxQueueSize: options.maxQueueSize,
      flushInterval: options.flushInterval,
    });

    // Initialize event manager
    this.eventManager = new EventManager(this.eventQueue, options);

    // Check consent status
    if (this.hasOptedOutTracking()) {
      logger.info("User has previously opted out of tracking");
    }

    // Initialize Wagmi handler if provided and config is valid
    if (options.wagmi?.config) {
      logger.info("FormoAnalytics: Initializing in Wagmi mode");
      this.wagmiHandler = new WagmiEventHandler(
        this,
        options.wagmi.config,
        options.wagmi.queryClient
      );
    } else if (options.wagmi) {
      logger.warn("FormoAnalytics: wagmi option provided but config is missing");
    }
  }

  /**
   * Initialize the SDK
   * @param writeKey - Your Formo write key
   * @param options - Configuration options
   * @param asyncStorage - AsyncStorage instance from @react-native-async-storage/async-storage
   */
  static async init(
    writeKey: string,
    options?: Options,
    asyncStorage?: AsyncStorageInterface
  ): Promise<FormoAnalytics> {
    const storageManager = initStorageManager(writeKey);

    // Initialize storage with AsyncStorage if provided
    if (asyncStorage) {
      await storageManager.initialize(asyncStorage);
    }

    const analytics = new FormoAnalytics(writeKey, options);

    // Initialize lifecycle tracking if enabled
    // Wrapped in try-catch so a transient storage failure doesn't prevent SDK init
    if (analytics.isAutocaptureEnabled("lifecycle")) {
      try {
        analytics.lifecycleManager = new AppLifecycleManager(analytics);
        await analytics.lifecycleManager.start(options?.app);
      } catch (error) {
        logger.error("FormoAnalytics: Failed to initialize lifecycle tracking", error);
      }
    }

    // Call ready callback
    if (options?.ready) {
      options.ready(analytics);
    }

    return analytics;
  }

  /**
   * Track a screen view (mobile equivalent of page view)
   */
  public async screen(
    name: string,
    category?: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    // Note: shouldTrack() is called in trackEvent() - no need to check here
    await this.trackEvent(
      EventType.SCREEN,
      { name, ...(category && { category }) },
      properties,
      context,
      callback
    );
  }

  /**
   * Set traffic source from deep link URL
   * Parses UTM parameters and referrer information from URL
   * This is automatically persisted for the session
   *
   * @param url - Deep link URL (e.g., "myapp://product?utm_source=facebook&ref=friend123")
   *
   * @example
   * ```tsx
   * import { Linking } from 'react-native';
   *
   * // Listen for deep links
   * Linking.addEventListener('url', (event) => {
   *   formo.setTrafficSourceFromUrl(event.url);
   * });
   *
   * // Or get initial URL
   * Linking.getInitialURL().then((url) => {
   *   if (url) formo.setTrafficSourceFromUrl(url);
   * });
   * ```
   */
  public setTrafficSourceFromUrl(url: string): void {
    const trafficSource = parseTrafficSource(
      url,
      this.options.referral?.queryParams,
      this.options.referral?.pathPattern
    );
    storeTrafficSource(trafficSource);
    logger.debug("Traffic source set from URL:", trafficSource);
  }

  /**
   * Reset the current user session
   */
  public reset(): void {
    this.currentUserId = undefined;
    storage().remove(LOCAL_ANONYMOUS_ID_KEY);
    storage().remove(SESSION_USER_ID_KEY);
    this.session.clear();
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    logger.info("FormoAnalytics: Cleaning up resources");

    if (this.lifecycleManager) {
      this.lifecycleManager.cleanup();
      this.lifecycleManager = undefined;
    }

    if (this.wagmiHandler) {
      this.wagmiHandler.cleanup();
      this.wagmiHandler = undefined;
    }

    if (this.eventQueue) {
      await this.eventQueue.cleanup();
    }

    logger.info("FormoAnalytics: Cleanup complete");
  }

  /**
   * Track wallet connect event
   */
  async connect(
    { chainId, address }: { chainId: ChainID; address: Address },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    if (chainId === null || chainId === undefined || Number(chainId) === 0) {
      logger.warn("Connect: Chain ID cannot be null, undefined, or 0");
      return;
    }
    if (!address) {
      logger.warn("Connect: Address cannot be empty");
      return;
    }

    const checksummedAddress = this.validateAndChecksumAddress(address);
    if (!checksummedAddress) {
      logger.warn(`Connect: Invalid address provided ("${address}")`);
      return;
    }

    // Track event before updating state so connect events TO excluded chains are tracked
    await this.trackEvent(
      EventType.CONNECT,
      { chainId, address: checksummedAddress },
      properties,
      context,
      callback
    );

    this.currentChainId = chainId;
    this.currentAddress = checksummedAddress;
  }

  /**
   * Track wallet disconnect event
   */
  async disconnect(
    params?: { chainId?: ChainID; address?: Address },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    const chainId = params?.chainId || this.currentChainId;
    const address = params?.address || this.currentAddress;

    logger.info("Disconnect: Emitting disconnect event with:", {
      chainId,
      address,
    });

    await this.trackEvent(
      EventType.DISCONNECT,
      {
        ...(chainId && { chainId }),
        ...(address && { address }),
      },
      properties,
      context,
      callback
    );

    this.currentAddress = undefined;
    this.currentChainId = undefined;
  }

  /**
   * Track chain change event
   */
  async chain(
    { chainId, address }: { chainId: ChainID; address?: Address },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    if (!chainId || Number(chainId) === 0) {
      logger.warn("FormoAnalytics::chain: chainId cannot be empty or 0");
      return;
    }
    if (isNaN(Number(chainId))) {
      logger.warn("FormoAnalytics::chain: chainId must be a valid number");
      return;
    }
    if (!address && !this.currentAddress) {
      logger.warn("FormoAnalytics::chain: address was empty and no previous address recorded");
      return;
    }

    // Track event before updating currentChainId so shouldTrack uses the previous chain
    // This ensures chain change events TO excluded chains are still tracked
    await this.trackEvent(
      EventType.CHAIN,
      { chainId, address: address || this.currentAddress },
      properties,
      context,
      callback
    );

    this.currentChainId = chainId;
  }

  /**
   * Track signature event
   */
  async signature(
    {
      status,
      chainId,
      address,
      message,
      signatureHash,
    }: {
      status: SignatureStatus;
      chainId?: ChainID;
      address: Address;
      message: string;
      signatureHash?: string;
    },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    if (!address) {
      logger.warn("Signature: Address cannot be empty");
      return;
    }
    await this.trackEvent(
      EventType.SIGNATURE,
      {
        status,
        ...(chainId !== undefined && chainId !== null && { chainId }),
        address,
        message,
        ...(signatureHash && { signatureHash }),
      },
      properties,
      context,
      callback
    );
  }

  /**
   * Track transaction event
   */
  async transaction(
    {
      status,
      chainId,
      address,
      data,
      to,
      value,
      transactionHash,
      function_name,
      function_args,
    }: {
      status: TransactionStatus;
      chainId: ChainID;
      address: Address;
      data?: string;
      to?: string;
      value?: string;
      transactionHash?: string;
      function_name?: string;
      function_args?: Record<string, unknown>;
    },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    if (chainId === null || chainId === undefined || Number(chainId) === 0) {
      logger.warn("Transaction: Chain ID cannot be null, undefined, or 0");
      return;
    }
    if (!address) {
      logger.warn("Transaction: Address cannot be empty");
      return;
    }
    await this.trackEvent(
      EventType.TRANSACTION,
      {
        status,
        chainId,
        address,
        data,
        to,
        value,
        ...(transactionHash && { transactionHash }),
        ...(function_name && { function_name }),
        ...(function_args && { function_args }),
      },
      properties,
      context,
      callback
    );
  }

  /**
   * Track identify event
   */
  async identify(
    params: {
      address: Address;
      providerName?: string;
      userId?: string;
      rdns?: string;
    },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    try {
      const { userId, address, providerName, rdns } = params;
      logger.info("Identify", address, userId, providerName, rdns);

      let validAddress: Address | undefined = undefined;
      if (address) {
        validAddress = this.validateAndChecksumAddress(address);
        if (!validAddress) {
          logger.warn(`Identify: Invalid address provided ("${address}")`);
          return;
        }
        this.currentAddress = validAddress;
      } else {
        this.currentAddress = undefined;
      }

      if (userId) {
        this.currentUserId = userId;
        storage().set(SESSION_USER_ID_KEY, userId);
      }

      // Check for duplicate identify
      const isAlreadyIdentified = validAddress
        ? this.session.isWalletIdentified(validAddress, rdns || "")
        : false;

      if (isAlreadyIdentified) {
        logger.info(
          `Identify: Wallet ${providerName || "Unknown"} with address ${validAddress} already identified`
        );
        return;
      }

      // Mark as identified
      if (validAddress) {
        this.session.markWalletIdentified(validAddress, rdns || "");
      }

      await this.trackEvent(
        EventType.IDENTIFY,
        { address: validAddress, providerName, userId, rdns },
        properties,
        context,
        callback
      );
    } catch (e) {
      logger.log("identify error", e);
    }
  }

  /**
   * Track detect wallet event
   */
  async detect(
    { providerName, rdns }: { providerName: string; rdns: string },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    if (this.session.isWalletDetected(rdns)) {
      logger.warn(`Detect: Wallet ${providerName} already detected in this session`);
      return;
    }

    this.session.markWalletDetected(rdns);
    await this.trackEvent(
      EventType.DETECT,
      { providerName, rdns },
      properties,
      context,
      callback
    );
  }

  /**
   * Track custom event
   */
  async track(
    event: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    await this.trackEvent(
      EventType.TRACK,
      { event },
      properties,
      context,
      callback
    );
  }

  /**
   * Opt out of tracking
   */
  public optOutTracking(): void {
    logger.info("Opting out of tracking");
    setConsentFlag(this.writeKey, CONSENT_OPT_OUT_KEY, "true");
    this.eventQueue.clear();
    this.reset();
    logger.info("Successfully opted out of tracking");
  }

  /**
   * Opt back into tracking
   */
  public optInTracking(): void {
    logger.info("Opting back into tracking");
    removeConsentFlag(this.writeKey, CONSENT_OPT_OUT_KEY);
    logger.info("Successfully opted back into tracking");
  }

  /**
   * Check if user has opted out
   */
  public hasOptedOutTracking(): boolean {
    return getConsentFlag(this.writeKey, CONSENT_OPT_OUT_KEY) === "true";
  }

  /**
   * Check if autocapture is enabled for event type
   */
  public isAutocaptureEnabled(
    eventType: "connect" | "disconnect" | "signature" | "transaction" | "chain" | "lifecycle"
  ): boolean {
    if (this.options.autocapture === undefined) {
      return true;
    }

    if (typeof this.options.autocapture === "boolean") {
      return this.options.autocapture;
    }

    if (
      this.options.autocapture !== null &&
      typeof this.options.autocapture === "object"
    ) {
      const eventConfig = this.options.autocapture[eventType];
      return eventConfig !== false;
    }

    return true;
  }

  /**
   * Internal method to track events
   * This is the single enforcement point for shouldTrack() - all public tracking
   * methods (track, screen, connect, etc.) route through here
   */
  private async trackEvent(
    type: TEventType,
    payload?: Record<string, unknown>,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    try {
      if (!this.shouldTrack()) {
        logger.info(`Skipping ${type} event due to tracking configuration`);
        return;
      }

      await this.eventManager.addEvent(
        {
          type,
          ...payload,
          properties,
          context,
          callback,
        } as any,
        this.currentAddress,
        this.currentUserId
      );
    } catch (error) {
      logger.error("Error tracking event:", error);
      if (this.options.errorHandler) {
        try {
          this.options.errorHandler(error instanceof Error ? error : new Error(String(error)));
        } catch (handlerError) {
          logger.error("Error in errorHandler callback:", handlerError);
        }
      }
    }
  }

  /**
   * Check if tracking should be enabled
   */
  private shouldTrack(): boolean {
    // Check consent
    if (this.hasOptedOutTracking()) {
      return false;
    }

    // Check tracking option
    if (typeof this.options.tracking === "boolean") {
      return this.options.tracking;
    }

    // Handle object configuration
    if (
      this.options.tracking !== null &&
      typeof this.options.tracking === "object" &&
      !Array.isArray(this.options.tracking)
    ) {
      const { excludeChains = [] } = this.options.tracking as TrackingOptions;

      if (
        excludeChains.length > 0 &&
        this.currentChainId &&
        excludeChains.includes(this.currentChainId)
      ) {
        return false;
      }

      return true;
    }

    // Default: track
    return true;
  }

  /**
   * Validate and checksum address
   */
  private validateAndChecksumAddress(address: string): Address | undefined {
    const validAddress = getValidAddress(address);
    return validAddress ? toChecksumAddress(validAddress) : undefined;
  }

  /**
   * Flush pending events
   */
  public async flush(): Promise<void> {
    await this.eventQueue.flush();
  }
}
