"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FormoAnalytics = void 0;
var _constants = require("./constants");
var _storage = require("./lib/storage");
var _event = require("./lib/event");
var _logger = require("./lib/logger");
var _consent = require("./lib/consent");
var _session = require("./lib/session");
var _wagmi = require("./lib/wagmi");
var _utils = require("./utils");
/**
 * FormoAnalytics for React Native
 *
 * Main SDK class for tracking wallet events and user analytics in mobile dApps
 */

class FormoAnalytics {
  currentUserId = "";
  constructor(writeKey, options = {}) {
    this.writeKey = writeKey;
    this.options = options;
    this.config = {
      writeKey
    };
    this.options = options;
    this.session = new _session.FormoAnalyticsSession();
    this.currentUserId = (0, _storage.storage)().get(_constants.SESSION_USER_ID_KEY) || undefined;

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
    _logger.Logger.init({
      enabled: options.logger?.enabled || false,
      enabledLevels: options.logger?.levels || []
    });

    // Initialize event queue
    this.eventQueue = new _event.EventQueue(this.config.writeKey, {
      apiHost: options.apiHost || _constants.EVENTS_API_HOST,
      flushAt: options.flushAt,
      retryCount: options.retryCount,
      maxQueueSize: options.maxQueueSize,
      flushInterval: options.flushInterval
    });

    // Initialize event manager
    this.eventManager = new _event.EventManager(this.eventQueue, options);

    // Check consent status
    if (this.hasOptedOutTracking()) {
      _logger.logger.info("User has previously opted out of tracking");
    }

    // Initialize Wagmi handler if provided and config is valid
    if (options.wagmi?.config) {
      _logger.logger.info("FormoAnalytics: Initializing in Wagmi mode");
      this.wagmiHandler = new _wagmi.WagmiEventHandler(this, options.wagmi.config, options.wagmi.queryClient);
    } else if (options.wagmi) {
      _logger.logger.warn("FormoAnalytics: wagmi option provided but config is missing");
    }
  }

  /**
   * Initialize the SDK
   * @param writeKey - Your Formo write key
   * @param options - Configuration options
   * @param asyncStorage - AsyncStorage instance from @react-native-async-storage/async-storage
   */
  static async init(writeKey, options, asyncStorage) {
    const storageManager = (0, _storage.initStorageManager)(writeKey);

    // Initialize storage with AsyncStorage if provided
    if (asyncStorage) {
      await storageManager.initialize(asyncStorage);
    }
    const analytics = new FormoAnalytics(writeKey, options);

    // Call ready callback
    if (options?.ready) {
      options.ready(analytics);
    }
    return analytics;
  }

  /**
   * Track a screen view (mobile equivalent of page view)
   */
  async screen(name, properties, context, callback) {
    // Note: shouldTrack() is called in trackEvent() - no need to check here
    await this.trackEvent(_constants.EventType.SCREEN, {
      name
    }, properties, context, callback);
  }

  /**
   * Reset the current user session
   */
  reset() {
    this.currentUserId = undefined;
    (0, _storage.storage)().remove(_constants.LOCAL_ANONYMOUS_ID_KEY);
    (0, _storage.storage)().remove(_constants.SESSION_USER_ID_KEY);
    this.session.clear();
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    _logger.logger.info("FormoAnalytics: Cleaning up resources");
    if (this.wagmiHandler) {
      this.wagmiHandler.cleanup();
      this.wagmiHandler = undefined;
    }
    if (this.eventQueue) {
      await this.eventQueue.cleanup();
    }
    _logger.logger.info("FormoAnalytics: Cleanup complete");
  }

  /**
   * Track wallet connect event
   */
  async connect({
    chainId,
    address
  }, properties, context, callback) {
    if (chainId === null || chainId === undefined || Number(chainId) === 0) {
      _logger.logger.warn("Connect: Chain ID cannot be null, undefined, or 0");
      return;
    }
    if (!address) {
      _logger.logger.warn("Connect: Address cannot be empty");
      return;
    }
    const checksummedAddress = this.validateAndChecksumAddress(address);
    if (!checksummedAddress) {
      _logger.logger.warn(`Connect: Invalid address provided ("${address}")`);
      return;
    }

    // Track event before updating state so connect events TO excluded chains are tracked
    await this.trackEvent(_constants.EventType.CONNECT, {
      chainId,
      address: checksummedAddress
    }, properties, context, callback);
    this.currentChainId = chainId;
    this.currentAddress = checksummedAddress;
  }

  /**
   * Track wallet disconnect event
   */
  async disconnect(params, properties, context, callback) {
    const chainId = params?.chainId || this.currentChainId;
    const address = params?.address || this.currentAddress;
    _logger.logger.info("Disconnect: Emitting disconnect event with:", {
      chainId,
      address
    });
    await this.trackEvent(_constants.EventType.DISCONNECT, {
      ...(chainId && {
        chainId
      }),
      ...(address && {
        address
      })
    }, properties, context, callback);
    this.currentAddress = undefined;
    this.currentChainId = undefined;
  }

  /**
   * Track chain change event
   */
  async chain({
    chainId,
    address
  }, properties, context, callback) {
    if (!chainId || Number(chainId) === 0) {
      _logger.logger.warn("FormoAnalytics::chain: chainId cannot be empty or 0");
      return;
    }
    if (isNaN(Number(chainId))) {
      _logger.logger.warn("FormoAnalytics::chain: chainId must be a valid number");
      return;
    }
    if (!address && !this.currentAddress) {
      _logger.logger.warn("FormoAnalytics::chain: address was empty and no previous address recorded");
      return;
    }

    // Track event before updating currentChainId so shouldTrack uses the previous chain
    // This ensures chain change events TO excluded chains are still tracked
    await this.trackEvent(_constants.EventType.CHAIN, {
      chainId,
      address: address || this.currentAddress
    }, properties, context, callback);
    this.currentChainId = chainId;
  }

  /**
   * Track signature event
   */
  async signature({
    status,
    chainId,
    address,
    message,
    signatureHash
  }, properties, context, callback) {
    if (chainId === null || chainId === undefined || Number(chainId) === 0) {
      _logger.logger.warn("Signature: Chain ID cannot be null, undefined, or 0");
      return;
    }
    if (!address) {
      _logger.logger.warn("Signature: Address cannot be empty");
      return;
    }
    await this.trackEvent(_constants.EventType.SIGNATURE, {
      status,
      chainId,
      address,
      message,
      ...(signatureHash && {
        signatureHash
      })
    }, properties, context, callback);
  }

  /**
   * Track transaction event
   */
  async transaction({
    status,
    chainId,
    address,
    data,
    to,
    value,
    transactionHash
  }, properties, context, callback) {
    if (chainId === null || chainId === undefined || Number(chainId) === 0) {
      _logger.logger.warn("Transaction: Chain ID cannot be null, undefined, or 0");
      return;
    }
    if (!address) {
      _logger.logger.warn("Transaction: Address cannot be empty");
      return;
    }
    await this.trackEvent(_constants.EventType.TRANSACTION, {
      status,
      chainId,
      address,
      data,
      to,
      value,
      ...(transactionHash && {
        transactionHash
      })
    }, properties, context, callback);
  }

  /**
   * Track identify event
   */
  async identify(params, properties, context, callback) {
    try {
      const {
        userId,
        address,
        providerName,
        rdns
      } = params;
      _logger.logger.info("Identify", address, userId, providerName, rdns);
      let validAddress = undefined;
      if (address) {
        validAddress = this.validateAndChecksumAddress(address);
        this.currentAddress = validAddress || undefined;
        if (!validAddress) {
          _logger.logger.warn("Invalid address provided to identify:", address);
        }
      } else {
        this.currentAddress = undefined;
      }
      if (userId) {
        this.currentUserId = userId;
        (0, _storage.storage)().set(_constants.SESSION_USER_ID_KEY, userId);
      }

      // Check for duplicate identify
      const isAlreadyIdentified = validAddress ? this.session.isWalletIdentified(validAddress, rdns || "") : false;
      if (isAlreadyIdentified) {
        _logger.logger.info(`Identify: Wallet ${providerName || "Unknown"} with address ${validAddress} already identified`);
        return;
      }

      // Mark as identified
      if (validAddress) {
        this.session.markWalletIdentified(validAddress, rdns || "");
      }
      await this.trackEvent(_constants.EventType.IDENTIFY, {
        address: validAddress,
        providerName,
        userId,
        rdns
      }, properties, context, callback);
    } catch (e) {
      _logger.logger.log("identify error", e);
    }
  }

  /**
   * Track detect wallet event
   */
  async detect({
    providerName,
    rdns
  }, properties, context, callback) {
    if (this.session.isWalletDetected(rdns)) {
      _logger.logger.warn(`Detect: Wallet ${providerName} already detected in this session`);
      return;
    }
    this.session.markWalletDetected(rdns);
    await this.trackEvent(_constants.EventType.DETECT, {
      providerName,
      rdns
    }, properties, context, callback);
  }

  /**
   * Track custom event
   */
  async track(event, properties, context, callback) {
    await this.trackEvent(_constants.EventType.TRACK, {
      event
    }, properties, context, callback);
  }

  /**
   * Opt out of tracking
   */
  optOutTracking() {
    _logger.logger.info("Opting out of tracking");
    (0, _consent.setConsentFlag)(this.writeKey, _constants.CONSENT_OPT_OUT_KEY, "true");
    this.eventQueue.clear();
    this.reset();
    _logger.logger.info("Successfully opted out of tracking");
  }

  /**
   * Opt back into tracking
   */
  optInTracking() {
    _logger.logger.info("Opting back into tracking");
    (0, _consent.removeConsentFlag)(this.writeKey, _constants.CONSENT_OPT_OUT_KEY);
    _logger.logger.info("Successfully opted back into tracking");
  }

  /**
   * Check if user has opted out
   */
  hasOptedOutTracking() {
    return (0, _consent.getConsentFlag)(this.writeKey, _constants.CONSENT_OPT_OUT_KEY) === "true";
  }

  /**
   * Check if autocapture is enabled for event type
   */
  isAutocaptureEnabled(eventType) {
    if (this.options.autocapture === undefined) {
      return true;
    }
    if (typeof this.options.autocapture === "boolean") {
      return this.options.autocapture;
    }
    if (this.options.autocapture !== null && typeof this.options.autocapture === "object") {
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
  async trackEvent(type, payload, properties, context, callback) {
    try {
      if (!this.shouldTrack()) {
        _logger.logger.info(`Skipping ${type} event due to tracking configuration`);
        return;
      }
      await this.eventManager.addEvent({
        type,
        ...payload,
        properties,
        context,
        callback
      }, this.currentAddress, this.currentUserId);
    } catch (error) {
      _logger.logger.error("Error tracking event:", error);
    }
  }

  /**
   * Check if tracking should be enabled
   */
  shouldTrack() {
    // Check consent
    if (this.hasOptedOutTracking()) {
      return false;
    }

    // Check tracking option
    if (typeof this.options.tracking === "boolean") {
      return this.options.tracking;
    }

    // Handle object configuration
    if (this.options.tracking !== null && typeof this.options.tracking === "object" && !Array.isArray(this.options.tracking)) {
      const {
        excludeChains = []
      } = this.options.tracking;
      if (excludeChains.length > 0 && this.currentChainId && excludeChains.includes(this.currentChainId)) {
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
  validateAndChecksumAddress(address) {
    const validAddress = (0, _utils.getValidAddress)(address);
    return validAddress ? (0, _utils.toChecksumAddress)(validAddress) : undefined;
  }

  /**
   * Flush pending events
   */
  async flush() {
    await this.eventQueue.flush();
  }
}
exports.FormoAnalytics = FormoAnalytics;
//# sourceMappingURL=FormoAnalytics.js.map