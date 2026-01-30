"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventFactory = void 0;
var _reactNative = require("react-native");
var _constants = require("../../constants");
var _utils = require("../../utils");
var _timestamp = require("../../utils/timestamp");
var _hash = require("../../utils/hash");
var _logger = require("../logger");
var _storage = require("../storage");
// SDK version
const SDK_VERSION = "1.0.0";

/**
 * Generate or retrieve anonymous ID
 */
function generateAnonymousId(key) {
  const existing = (0, _storage.storage)().get(key);
  if (existing) {
    return existing;
  }
  const newId = (0, _hash.generateUUID)();
  (0, _storage.storage)().set(key, newId);
  return newId;
}

/**
 * Event factory for React Native
 * Creates event payloads with mobile-specific context
 */
class EventFactory {
  constructor(options) {
    this.options = options;
  }

  /**
   * Get device timezone
   */
  getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      _logger.logger.error("Error resolving timezone:", error);
      return "";
    }
  }

  /**
   * Get location from timezone
   */
  getLocation() {
    try {
      const timezone = this.getTimezone();
      if (timezone in _constants.COUNTRY_LIST) {
        return _constants.COUNTRY_LIST[timezone] ?? timezone;
      }
      return timezone;
    } catch (error) {
      _logger.logger.error("Error resolving location:", error);
      return "";
    }
  }

  /**
   * Get device language/locale
   */
  getLanguage() {
    try {
      // Try to get the device locale
      const locale = _reactNative.Platform.OS === "ios" ? _reactNative.NativeModules.SettingsManager?.settings?.AppleLocale || _reactNative.NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] : _reactNative.NativeModules.I18nManager?.localeIdentifier;
      return locale || "en";
    } catch (error) {
      _logger.logger.debug("Error resolving language:", error);
      return "en";
    }
  }

  /**
   * Get screen dimensions
   */
  getScreen() {
    try {
      const {
        width,
        height,
        scale
      } = _reactNative.Dimensions.get("screen");
      return {
        screen_width: Math.round(width),
        screen_height: Math.round(height),
        screen_density: scale
      };
    } catch (error) {
      _logger.logger.error("Error resolving screen properties:", error);
      return {
        screen_width: 0,
        screen_height: 0,
        screen_density: 1
      };
    }
  }

  /**
   * Get device information
   */
  getDeviceInfo() {
    try {
      return {
        os_name: _reactNative.Platform.OS,
        os_version: String(_reactNative.Platform.Version),
        device_model: _reactNative.Platform.select({
          ios: "iOS Device",
          android: "Android Device"
        }) || "Unknown",
        device_type: "mobile"
      };
    } catch (error) {
      _logger.logger.error("Error getting device info:", error);
      return {
        os_name: "unknown",
        os_version: "unknown",
        device_model: "unknown",
        device_type: "mobile"
      };
    }
  }

  /**
   * Generate context with mobile-specific metadata
   */
  async generateContext(context) {
    const language = this.getLanguage();
    const timezone = this.getTimezone();
    const location = this.getLocation();
    const deviceInfo = this.getDeviceInfo();
    const screenInfo = this.getScreen();
    const defaultContext = {
      locale: language,
      timezone,
      location,
      library_name: "Formo React Native SDK",
      library_version: SDK_VERSION,
      ...deviceInfo,
      ...screenInfo,
      // App info from options
      ...(this.options?.app && {
        app_name: this.options.app.name,
        app_version: this.options.app.version,
        app_build: this.options.app.build,
        app_bundle_id: this.options.app.bundleId
      })
    };
    const mergedContext = (0, _utils.mergeDeepRight)(defaultContext, context || {});
    return mergedContext;
  }

  /**
   * Create enriched event with common properties
   */
  async getEnrichedEvent(formoEvent, context) {
    const commonEventData = {
      context: await this.generateContext(context),
      original_timestamp: (0, _timestamp.getCurrentTimeFormatted)(),
      user_id: formoEvent.user_id,
      type: formoEvent.type,
      channel: _constants.CHANNEL,
      version: _constants.VERSION
    };
    commonEventData.anonymous_id = generateAnonymousId(_constants.LOCAL_ANONYMOUS_ID_KEY);

    // Handle address - convert undefined to null for consistency
    const validAddress = (0, _utils.getValidAddress)(formoEvent.address);
    if (validAddress) {
      commonEventData.address = (0, _utils.toChecksumAddress)(validAddress);
    } else {
      commonEventData.address = null;
    }
    const processedEvent = (0, _utils.mergeDeepRight)(formoEvent, commonEventData);
    if (processedEvent.event === undefined) {
      processedEvent.event = null;
    }
    if (processedEvent.properties === undefined) {
      processedEvent.properties = null;
    }
    return (0, _utils.toSnakeCase)(processedEvent);
  }

  /**
   * Generate screen view event (mobile equivalent of page)
   */
  async generateScreenEvent(name, properties, context) {
    const props = {
      ...(properties ?? {}),
      name
    };
    const screenEvent = {
      properties: props,
      type: "screen"
    };
    return this.getEnrichedEvent(screenEvent, context);
  }
  async generateDetectWalletEvent(providerName, rdns, properties, context) {
    const detectEvent = {
      properties: {
        providerName,
        rdns,
        ...properties
      },
      type: "detect"
    };
    return this.getEnrichedEvent(detectEvent, context);
  }
  async generateIdentifyEvent(providerName, rdns, address, userId, properties, context) {
    const identifyEvent = {
      properties: {
        providerName,
        rdns,
        ...properties
      },
      user_id: userId,
      address,
      type: "identify"
    };
    return this.getEnrichedEvent(identifyEvent, context);
  }
  async generateConnectEvent(chainId, address, properties, context) {
    const connectEvent = {
      properties: {
        chainId,
        ...properties
      },
      address,
      type: "connect"
    };
    return this.getEnrichedEvent(connectEvent, context);
  }
  async generateDisconnectEvent(chainId, address, properties, context) {
    const disconnectEvent = {
      properties: {
        chainId,
        ...properties
      },
      address,
      type: "disconnect"
    };
    return this.getEnrichedEvent(disconnectEvent, context);
  }
  async generateChainChangedEvent(chainId, address, properties, context) {
    const chainEvent = {
      properties: {
        chainId,
        ...properties
      },
      address,
      type: "chain"
    };
    return this.getEnrichedEvent(chainEvent, context);
  }
  async generateSignatureEvent(status, chainId, address, message, signatureHash, properties, context) {
    const signatureEvent = {
      properties: {
        status,
        chainId,
        message,
        ...(signatureHash && {
          signatureHash
        }),
        ...properties
      },
      address,
      type: "signature"
    };
    return this.getEnrichedEvent(signatureEvent, context);
  }
  async generateTransactionEvent(status, chainId, address, data, to, value, transactionHash, properties, context) {
    const transactionEvent = {
      properties: {
        status,
        chainId,
        data,
        to,
        value,
        ...(transactionHash && {
          transactionHash
        }),
        ...properties
      },
      address,
      type: "transaction"
    };
    return this.getEnrichedEvent(transactionEvent, context);
  }
  async generateTrackEvent(event, properties, context) {
    const trackEvent = {
      properties: {
        ...properties,
        ...(properties?.revenue !== undefined && {
          revenue: Number(properties.revenue),
          currency: (typeof properties?.currency === "string" ? properties.currency : "USD").toLowerCase()
        }),
        ...(properties?.points !== undefined && {
          points: Number(properties.points)
        }),
        ...(properties?.volume !== undefined && {
          volume: Number(properties.volume)
        })
      },
      event,
      type: "track"
    };
    return this.getEnrichedEvent(trackEvent, context);
  }

  /**
   * Create event from API event type
   */
  async create(event, address, userId) {
    let formoEvent = {};
    switch (event.type) {
      case "screen":
        formoEvent = await this.generateScreenEvent(event.name, event.properties, event.context);
        break;
      case "detect":
        formoEvent = await this.generateDetectWalletEvent(event.providerName, event.rdns, event.properties, event.context);
        break;
      case "identify":
        formoEvent = await this.generateIdentifyEvent(event.providerName, event.rdns, event.address, event.userId, event.properties, event.context);
        break;
      case "chain":
        formoEvent = await this.generateChainChangedEvent(event.chainId, event.address, event.properties, event.context);
        break;
      case "connect":
        formoEvent = await this.generateConnectEvent(event.chainId, event.address, event.properties, event.context);
        break;
      case "disconnect":
        formoEvent = await this.generateDisconnectEvent(event.chainId, event.address, event.properties, event.context);
        break;
      case "signature":
        formoEvent = await this.generateSignatureEvent(event.status, event.chainId, event.address, event.message, event.signatureHash, event.properties, event.context);
        break;
      case "transaction":
        formoEvent = await this.generateTransactionEvent(event.status, event.chainId, event.address, event.data, event.to, event.value, event.transactionHash, event.properties, event.context);
        break;
      case "track":
      default:
        formoEvent = await this.generateTrackEvent(event.event, event.properties, event.context);
        break;
    }

    // Set address if not already set by the specific event generator
    if (formoEvent.address === undefined || formoEvent.address === null) {
      const validAddress = (0, _utils.getValidAddress)(address);
      formoEvent.address = validAddress ? (0, _utils.toChecksumAddress)(validAddress) : null;
    }
    formoEvent.user_id = userId || null;
    return formoEvent;
  }
}
exports.EventFactory = EventFactory;
//# sourceMappingURL=EventFactory.js.map