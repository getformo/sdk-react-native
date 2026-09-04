/**
 * FormoAnalytics for React Native
 *
 * Main SDK class for tracking wallet events and user analytics in mobile dApps
 */

import {
  EVENTS_API_HOST,
  EventType,
  LOCAL_ANONYMOUS_ID_KEY,
  LOCAL_SESSION_ID_KEY,
  LOCAL_SESSION_LAST_ACTIVITY_KEY,
  SESSION_USER_ID_KEY,
  CONSENT_OPT_OUT_KEY,
  TEventType,
} from "./constants";
import { LIFECYCLE_EVENT } from "./constants/events";
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
import { CrashReporter } from "./lib/crash";
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
import { validateAddress } from "./utils";
import { clearTrafficSource, parseTrafficSource, updateStoredTrafficSource } from "./utils/trafficSource";
import { captureInstallReferrer } from "./lib/installReferrer";
import { Linking, EmitterSubscription } from "react-native";

/**
 * Autocapture behaviors that are OFF unless explicitly enabled, because
 * turning them on by default would change how an existing app behaves after a
 * routine SDK upgrade. See AutocaptureOptions for the reasoning per option.
 */
const OPT_IN_AUTOCAPTURE = new Set<string>(["foregrounded", "crashes"]);

export class FormoAnalytics implements IFormoAnalytics {
  private session: FormoAnalyticsSession;
  private eventManager: IEventManager;
  private eventQueue: EventQueue;
  private wagmiHandler?: WagmiEventHandler;
  private lifecycleManager?: AppLifecycleManager;
  private crashReporter?: CrashReporter;
  private initialDeepLinkUrl?: string;
  private linkingSubscription?: EmitterSubscription;
  private walletGeneration = 0;

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
    this.reset = this.reset.bind(this);
    this.cleanup = this.cleanup.bind(this);
    this.flush = this.flush.bind(this);
    this.setTrafficSourceFromUrl = this.setTrafficSourceFromUrl.bind(this);
    this.optOutTracking = this.optOutTracking.bind(this);
    this.optInTracking = this.optInTracking.bind(this);
    this.hasOptedOutTracking = this.hasOptedOutTracking.bind(this);
    this.pushNotificationReceived = this.pushNotificationReceived.bind(this);
    this.pushNotificationTapped = this.pushNotificationTapped.bind(this);
    this.pushNotificationBounced = this.pushNotificationBounced.bind(this);
    this.isAutocaptureEnabled = this.isAutocaptureEnabled.bind(this);
    this.isAttributionEnabled = this.isAttributionEnabled.bind(this);

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

    // Capture attribution BEFORE lifecycle tracking so the first
    // Application Installed/Opened events carry utm_*/ref/referrer.
    //
    // Both are awaited so the stored traffic source is populated before
    // lifecycle fires — that's what lets Application Installed report the
    // web-to-mobile referrer (e.g. referrer=example.com). Deep-link initial URL
    // is a fast native bridge call; the Android Play Install Referrer is a fast
    // one-shot native call (and no-ops instantly when the native module or the
    // platform isn't Android), so awaiting it does not meaningfully delay init.
    // Hook Linking if EITHER consumer needs it. The two flags control different
    // things — attribution.deeplinks parses UTMs into context, autocapture
    // .deepLinks emits Deep Link Opened — but both depend on observing the link
    // in the first place. Gating the hook on attribution alone silently
    // disabled the event for anyone who turned attribution off, with no
    // indication that an unrelated setting was responsible.
    if (
      analytics.isAttributionEnabled("deeplinks") ||
      analytics.isAutocaptureEnabled("deepLinks")
    ) {
      try {
        await analytics.startDeepLinkCapture();
      } catch (error) {
        logger.error("FormoAnalytics: Failed to initialize deep link capture", error);
      }
    }

    if (analytics.isAttributionEnabled("installReferrer")) {
      try {
        await captureInstallReferrer({
          customRefParams: analytics.options.referral?.queryParams,
          pathPattern: analytics.options.referral?.pathPattern,
          canCapture: () => !analytics.hasOptedOutTracking(),
        });
      } catch (error) {
        logger.debug("FormoAnalytics: install referrer capture failed", error);
      }
    }

    // Initialize lifecycle tracking if enabled
    // Wrapped in try-catch so a transient storage failure doesn't prevent SDK init
    if (analytics.isAutocaptureEnabled("lifecycle")) {
      try {
        analytics.lifecycleManager = new AppLifecycleManager(analytics);
        await analytics.lifecycleManager.start(options?.app, {
          trackForegrounded: analytics.isAutocaptureEnabled("foregrounded"),
        });
      } catch (error) {
        logger.error("FormoAnalytics: Failed to initialize lifecycle tracking", error);
      }
    }

    // Emit Deep Link Opened for the launch URL AFTER lifecycle tracking, so it
    // follows Application Opened as the Segment spec orders it.
    try {
      await analytics.trackInitialDeepLink();
    } catch (error) {
      logger.error("FormoAnalytics: Failed to track initial deep link", error);
    }

    // Opt-in: installs a global JS error handler (chained, never swallowing).
    if (analytics.isAutocaptureEnabled("crashes")) {
      try {
        analytics.crashReporter = new CrashReporter(analytics);
        analytics.crashReporter.start();
      } catch (error) {
        logger.error("FormoAnalytics: Failed to initialize crash tracking", error);
      }
    }

    // Call ready callback
    if (options?.ready) {
      options.ready(analytics);
    }

    return analytics;
  }

  /**
   * Hook into React Native's Linking API to auto-capture traffic source from
   * the launch URL and any subsequent deep-link opens. Awaits the initial URL
   * so attribution is in storage before the first lifecycle event fires.
   */
  private async startDeepLinkCapture(): Promise<void> {
    try {
      const url = await Linking.getInitialURL();
      if (url && !this.hasOptedOutTracking()) {
        if (this.isAttributionEnabled("deeplinks")) {
          this.setTrafficSourceFromUrl(url);
        }
        // Held, not emitted: this runs before lifecycle tracking starts, and
        // the Segment spec orders `Deep Link Opened` after `Application
        // Opened`. Emitted by trackInitialDeepLink() once lifecycle has fired.
        this.initialDeepLinkUrl = url;
      }
    } catch (error) {
      logger.debug("FormoAnalytics: Linking.getInitialURL failed", error);
    }

    // Runtime deep links (foreground opens, universal links).
    this.linkingSubscription = Linking.addEventListener("url", (event) => {
      if (!event?.url || this.hasOptedOutTracking()) return;
      // Each behaviour checks its own flag: the hook may exist because only one
      // of them is enabled.
      if (this.isAttributionEnabled("deeplinks")) {
        this.setTrafficSourceFromUrl(event.url);
      }
      void this.trackDeepLinkOpened(event.url);
    });
  }

  /**
   * Emit `Deep Link Opened` for the URL the app was launched with, if any.
   * Separate from capture so it can be ordered after `Application Opened`.
   */
  private async trackInitialDeepLink(): Promise<void> {
    const url = this.initialDeepLinkUrl;
    this.initialDeepLinkUrl = undefined;
    if (url) await this.trackDeepLinkOpened(url);
  }

  /**
   * Emit the Segment-spec `Deep Link Opened` event.
   *
   * `provider` is deliberately omitted: the spec uses it to name the
   * attribution provider that resolved the link (Branch, Adjust, …). The SDK
   * reads the link straight from React Native's Linking API, so there is no
   * provider to name, and emitting a placeholder would misreport the source.
   */
  private async trackDeepLinkOpened(url: string): Promise<void> {
    if (!this.isAutocaptureEnabled("deepLinks")) return;
    try {
      await this.track(LIFECYCLE_EVENT.DEEP_LINK_OPENED, { url });
    } catch (error) {
      logger.error("FormoAnalytics: Error tracking Deep Link Opened", error);
    }
  }

  /**
   * Track that a push notification was delivered to the device.
   *
   * Push delivery cannot be observed without a native module, so the SDK
   * cannot autocapture these — call this from your push handler
   * (`@react-native-firebase/messaging`, `expo-notifications`, …).
   *
   * @param properties Segment's push spec suggests `campaign_id`, `campaign_name`,
   *   `message_id`, `action` and `title`/`body`. Any properties are accepted.
   *
   * @example
   * ```tsx
   * messaging().onMessage(async (message) => {
   *   await formo.pushNotificationReceived({ message_id: message.messageId });
   * });
   * ```
   */
  public async pushNotificationReceived(
    properties?: IFormoEventProperties
  ): Promise<void> {
    await this.track(LIFECYCLE_EVENT.PUSH_NOTIFICATION_RECEIVED, properties);
  }

  /**
   * Track that the user opened the app by tapping a push notification.
   * See {@link pushNotificationReceived} for why this is not autocaptured.
   */
  public async pushNotificationTapped(
    properties?: IFormoEventProperties
  ): Promise<void> {
    await this.track(LIFECYCLE_EVENT.PUSH_NOTIFICATION_TAPPED, properties);
  }

  /**
   * Track that a push notification was not delivered — e.g. the OS suppressed
   * it, or the device token was rejected.
   * See {@link pushNotificationReceived} for why this is not autocaptured.
   */
  public async pushNotificationBounced(
    properties?: IFormoEventProperties
  ): Promise<void> {
    await this.track(LIFECYCLE_EVENT.PUSH_NOTIFICATION_BOUNCED, properties);
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
    if (this.hasOptedOutTracking()) return;
    const trafficSource = parseTrafficSource(
      url,
      this.options.referral?.queryParams,
      this.options.referral?.pathPattern
    );
    // Per-field merge: incoming non-empty fields win, empty fields preserve
    // stored values. A non-marketing deep link (e.g. "myapp://home") with only
    // a referrer will not destroy previously captured utm_*/ref attribution.
    updateStoredTrafficSource(trafficSource);
    logger.debug("Traffic source set from URL:", trafficSource);
  }

  /** Reset user and wallet state, preserving device identity and attribution. */
  public reset(): void {
    this.walletGeneration++;
    this.currentUserId = undefined;
    this.currentAddress = undefined;
    this.currentChainId = undefined;
    storage().remove(LOCAL_SESSION_ID_KEY);
    storage().remove(LOCAL_SESSION_LAST_ACTIVITY_KEY);
    storage().remove(SESSION_USER_ID_KEY);
    this.session.clear();
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    logger.info("FormoAnalytics: Cleaning up resources");

    if (this.crashReporter) {
      this.crashReporter.cleanup();
      this.crashReporter = undefined;
    }

    if (this.lifecycleManager) {
      this.lifecycleManager.cleanup();
      this.lifecycleManager = undefined;
    }

    if (this.linkingSubscription) {
      this.linkingSubscription.remove();
      this.linkingSubscription = undefined;
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

    const validatedAddress = this.validateAndChecksumAddress(address, chainId);
    if (!validatedAddress) {
      logger.warn(`Connect: Invalid address provided ("${address}")`);
      return;
    }
    if (this.hasOptedOutTracking()) return;
    const generation = ++this.walletGeneration;

    // Track event before updating state so connect events TO excluded chains are tracked
    await this.trackEvent(
      EventType.CONNECT,
      { chainId, address: validatedAddress },
      properties,
      context,
      callback
    );

    if (
      generation === this.walletGeneration &&
      !this.hasOptedOutTracking()
    ) {
      this.currentChainId = chainId;
      this.currentAddress = validatedAddress;
    }
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
    const generation = ++this.walletGeneration;
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

    if (generation === this.walletGeneration) {
      this.currentAddress = undefined;
      this.currentChainId = undefined;
    }
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
    if (this.hasOptedOutTracking()) return;
    const generation = ++this.walletGeneration;

    // Track event before updating currentChainId so shouldTrack uses the previous chain
    // This ensures chain change events TO excluded chains are still tracked
    await this.trackEvent(
      EventType.CHAIN,
      { chainId, address: address || this.currentAddress },
      properties,
      context,
      callback
    );

    if (
      generation === this.walletGeneration &&
      !this.hasOptedOutTracking()
    ) {
      this.currentChainId = chainId;
      if (address) this.currentAddress = address;
    }
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
    }: {
      status: SignatureStatus;
      chainId?: ChainID;
      address: Address;
      message: string;
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
      if (this.hasOptedOutTracking()) return;

      let validAddress: Address | undefined = undefined;
      if (address) {
        validAddress = this.validateAndChecksumAddress(address);
        if (!validAddress) {
          logger.warn(`Identify: Invalid address provided ("${address}")`);
          return;
        }
        this.walletGeneration++;
        this.currentAddress = validAddress;
        // Note: validateAddress returns Solana addresses unchanged (Base58, case-sensitive)
        // and EVM addresses checksummed.
      } else {
        this.walletGeneration++;
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
    if (this.hasOptedOutTracking()) return;
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
    // Consent withdrawal clears device identity and attribution too.
    storage().remove(LOCAL_ANONYMOUS_ID_KEY);
    clearTrafficSource();
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
   * Check if autocapture is enabled for a given event type.
   * Applies only to event-generating behaviors (wallet events, lifecycle
   * events). Attribution is controlled separately via `options.attribution`
   * because it enriches events rather than generating them.
   *
   * Most behaviors are on unless explicitly disabled. The two in
   * {@link OPT_IN_AUTOCAPTURE} invert that and require an explicit `true`,
   * because switching them on by default would change existing apps on a
   * version bump: `foregrounded` doubles foreground event volume, and
   * `crashes` installs a global error handler.
   */
  public isAutocaptureEnabled(
    eventType:
      | "connect"
      | "disconnect"
      | "signature"
      | "transaction"
      | "chain"
      | "lifecycle"
      | "foregrounded"
      | "deepLinks"
      | "crashes"
  ): boolean {
    const isOptIn = OPT_IN_AUTOCAPTURE.has(eventType);

    if (this.options.autocapture === undefined) {
      return !isOptIn;
    }

    // `autocapture: true` means "the usual set", not "everything including the
    // opt-in behaviors" — those still need naming individually.
    if (typeof this.options.autocapture === "boolean") {
      return this.options.autocapture && !isOptIn;
    }

    if (
      this.options.autocapture !== null &&
      typeof this.options.autocapture === "object"
    ) {
      const eventConfig = this.options.autocapture[eventType];
      return isOptIn ? eventConfig === true : eventConfig !== false;
    }

    return !isOptIn;
  }

  /**
   * Check if an attribution source is enabled. Attribution is not an event
   * type — it decorates every tracked event with `utm_*`, `ref`, and
   * `referrer` context fields.
   */
  public isAttributionEnabled(
    source: "deeplinks" | "installReferrer"
  ): boolean {
    if (this.options.attribution === undefined) {
      return true;
    }

    if (typeof this.options.attribution === "boolean") {
      return this.options.attribution;
    }

    if (
      this.options.attribution !== null &&
      typeof this.options.attribution === "object"
    ) {
      return this.options.attribution[source] !== false;
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
      const eventChainId =
        type === EventType.CONNECT || type === EventType.CHAIN
          ? this.currentChainId
          : (payload?.chainId as ChainID | undefined);
      if (!this.shouldTrack(eventChainId)) {
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
  private shouldTrack(eventChainId?: ChainID): boolean {
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
      const chainId = eventChainId ?? this.currentChainId;

      if (
        excludeChains.length > 0 &&
        chainId !== undefined &&
        chainId !== null &&
        excludeChains.includes(chainId)
      ) {
        return false;
      }

      return true;
    }

    // Default: track
    return true;
  }

  /**
   * Validate and normalize an address for the given chain.
   *
   * EVM addresses are returned in EIP-55 checksum format.
   * Solana addresses are returned as-is (Base58 is case-sensitive).
   * When chainId is omitted, EVM is tried first with Solana as fallback.
   */
  private validateAndChecksumAddress(
    address: string,
    chainId?: ChainID
  ): Address | undefined {
    return validateAddress(address, chainId);
  }

  /**
   * Flush pending events
   */
  public async flush(): Promise<void> {
    await this.eventQueue.flush();
  }
}
