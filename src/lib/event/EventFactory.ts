import { Platform, NativeModules, Dimensions } from "react-native";
import NetInfo from "@react-native-community/netinfo";

// Lazy load device info to handle Expo Go where native modules may not exist
let DeviceInfo: typeof import("react-native-device-info").default | null = null;
let ExpoDevice: typeof import("expo-device") | null = null;
let ExpoApplication: typeof import("expo-application") | null = null;

// Try to load react-native-device-info (works in bare RN and dev builds)
try {
  DeviceInfo = require("react-native-device-info").default;
} catch {
  // Not available - try Expo alternatives
}

// Try to load Expo modules (works in Expo Go and Expo dev builds)
try {
  ExpoDevice = require("expo-device");
} catch {
  // Not available
}

try {
  ExpoApplication = require("expo-application");
} catch {
  // Not available
}
import { COUNTRY_LIST, LOCAL_ANONYMOUS_ID_KEY, CHANNEL, VERSION } from "../../constants";
import {
  Address,
  APIEvent,
  ChainID,
  IFormoEvent,
  IFormoEventContext,
  IFormoEventProperties,
  Nullable,
  Options,
  SignatureStatus,
  TransactionStatus,
} from "../../types";
import {
  toChecksumAddress,
  getValidAddress,
  toSnakeCase,
  mergeDeepRight,
  getStoredTrafficSource,
} from "../../utils";
import { getCurrentTimeFormatted } from "../../utils/timestamp";
import { generateUUID } from "../../utils/hash";
import { logger } from "../logger";
import { storage } from "../storage";
import { IEventFactory } from "./types";
import { version as SDK_VERSION } from "../../version";

/**
 * Generate or retrieve anonymous ID
 */
function generateAnonymousId(key: string): string {
  const existing = storage().get(key);
  if (existing) {
    return existing;
  }

  const newId = generateUUID();
  storage().set(key, newId);
  return newId;
}

/**
 * Event factory for React Native
 * Creates event payloads with mobile-specific context
 */
class EventFactory implements IEventFactory {
  private options?: Options;

  constructor(options?: Options) {
    this.options = options;
  }

  /**
   * Get device timezone
   */
  private getTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      logger.error("Error resolving timezone:", error);
      return "";
    }
  }

  /**
   * Get location from timezone
   */
  private getLocation(): string {
    try {
      const timezone = this.getTimezone();
      if (timezone in COUNTRY_LIST) {
        return COUNTRY_LIST[timezone] ?? timezone;
      }
      return timezone;
    } catch (error) {
      logger.error("Error resolving location:", error);
      return "";
    }
  }

  /**
   * Get device language/locale
   */
  private getLanguage(): string {
    try {
      // Try to get the device locale
      const locale =
        Platform.OS === "ios"
          ? NativeModules.SettingsManager?.settings?.AppleLocale ||
            NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
          : NativeModules.I18nManager?.localeIdentifier;

      return locale || "en";
    } catch (error) {
      logger.debug("Error resolving language:", error);
      return "en";
    }
  }

  /**
   * Get screen dimensions
   */
  private getScreen(): {
    screen_width: number;
    screen_height: number;
    screen_density: number;
  } {
    try {
      const { width, height, scale } = Dimensions.get("screen");
      return {
        screen_width: Math.round(width),
        screen_height: Math.round(height),
        screen_density: scale,
      };
    } catch (error) {
      logger.error("Error resolving screen properties:", error);
      return {
        screen_width: 0,
        screen_height: 0,
        screen_density: 1,
      };
    }
  }

  /**
   * Get network information
   */
  private async getNetworkInfo(): Promise<{
    network_wifi?: boolean;
    network_cellular?: boolean;
    network_carrier?: string;
  }> {
    try {
      const netState = await NetInfo.fetch();

      const networkInfo: {
        network_wifi?: boolean;
        network_cellular?: boolean;
        network_carrier?: string;
      } = {};

      // Set connection type flags
      if (netState.type === "wifi") {
        networkInfo.network_wifi = true;
        networkInfo.network_cellular = false;
      } else if (netState.type === "cellular") {
        networkInfo.network_wifi = false;
        networkInfo.network_cellular = true;

        // Get carrier name for cellular connections
        if (netState.details && "carrier" in netState.details) {
          networkInfo.network_carrier = netState.details.carrier || undefined;
        }
      } else {
        // Other types (ethernet, bluetooth, wimax, vpn, other, unknown, none)
        networkInfo.network_wifi = false;
        networkInfo.network_cellular = false;
      }

      return networkInfo;
    } catch (error) {
      logger.debug("Error getting network info:", error);
      return {};
    }
  }

  /**
   * Get device information
   * Supports both react-native-device-info (bare RN) and expo-device/expo-application (Expo Go)
   */
  private async getDeviceInfo(): Promise<{
    os_name: string;
    os_version: string;
    device_model: string;
    device_manufacturer: string;
    device_name: string;
    device_type: string;
    user_agent: string;
    app_name: string;
    app_version: string;
    app_build: string;
    app_bundle_id: string;
  }> {
    // Try react-native-device-info first (bare RN and Expo dev builds)
    if (DeviceInfo) {
      try {
        const [model, manufacturer, deviceName, userAgent, isTablet] = await Promise.all([
          DeviceInfo.getModel(),
          DeviceInfo.getManufacturer(),
          DeviceInfo.getDeviceName(),
          DeviceInfo.getUserAgent(),
          DeviceInfo.isTablet(),
        ]);

        return {
          os_name: Platform.OS,
          os_version: DeviceInfo.getSystemVersion(),
          device_model: model,
          device_manufacturer: manufacturer,
          device_name: deviceName,
          device_type: isTablet ? "tablet" : "mobile",
          user_agent: userAgent,
          app_name: DeviceInfo.getApplicationName(),
          app_version: DeviceInfo.getVersion(),
          app_build: DeviceInfo.getBuildNumber(),
          app_bundle_id: DeviceInfo.getBundleId(),
        };
      } catch (error) {
        logger.debug("Error using react-native-device-info, falling back:", error);
      }
    }

    // Fall back to Expo modules (Expo Go)
    if (ExpoDevice || ExpoApplication) {
      try {
        const isTablet = ExpoDevice?.deviceType === ExpoDevice?.DeviceType?.TABLET;
        return {
          os_name: ExpoDevice?.osName || Platform.OS,
          os_version: ExpoDevice?.osVersion || String(Platform.Version),
          device_model: ExpoDevice?.modelName || "Unknown",
          device_manufacturer: ExpoDevice?.manufacturer || "Unknown",
          device_name: ExpoDevice?.deviceName || "Unknown Device",
          device_type: isTablet ? "tablet" : "mobile",
          user_agent: "",
          app_name: ExpoApplication?.applicationName || "",
          app_version: ExpoApplication?.nativeApplicationVersion || "",
          app_build: ExpoApplication?.nativeBuildVersion || "",
          app_bundle_id: ExpoApplication?.applicationId || "",
        };
      } catch (error) {
        logger.debug("Error using Expo device modules:", error);
      }
    }

    // Final fallback - minimal info from Platform
    logger.debug("No device info modules available, using Platform defaults");
    return {
      os_name: Platform.OS,
      os_version: String(Platform.Version),
      device_model: "Unknown",
      device_manufacturer: "Unknown",
      device_name: "Unknown Device",
      device_type: "mobile",
      user_agent: "",
      app_name: "",
      app_version: "",
      app_build: "",
      app_bundle_id: "",
    };
  }

  /**
   * Generate context with mobile-specific metadata
   */
  private async generateContext(
    context?: IFormoEventContext
  ): Promise<IFormoEventContext> {
    const language = this.getLanguage();
    const timezone = this.getTimezone();
    const location = this.getLocation();
    const deviceInfo = await this.getDeviceInfo();
    const networkInfo = await this.getNetworkInfo();
    const screenInfo = this.getScreen();

    // Get stored traffic source from session (UTM params, referrer from deep links)
    const storedTrafficSource = getStoredTrafficSource();

    const defaultContext: IFormoEventContext = {
      locale: language,
      timezone,
      location,
      library_name: "Formo React Native SDK",
      library_version: SDK_VERSION,
      ...deviceInfo,
      ...networkInfo,
      ...screenInfo,
      // App info from options (overrides auto-detected values)
      ...(this.options?.app?.name && { app_name: this.options.app.name }),
      ...(this.options?.app?.version && { app_version: this.options.app.version }),
      ...(this.options?.app?.build && { app_build: this.options.app.build }),
      ...(this.options?.app?.bundleId && { app_bundle_id: this.options.app.bundleId }),
      // Traffic source (UTM params, referrer) from session
      ...(storedTrafficSource || {}),
    };

    const mergedContext = mergeDeepRight(
      defaultContext,
      context || {}
    ) as IFormoEventContext;

    return mergedContext;
  }

  /**
   * Create enriched event with common properties
   */
  private async getEnrichedEvent(
    formoEvent: Partial<IFormoEvent>,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const commonEventData: Partial<IFormoEvent> = {
      context: await this.generateContext(context),
      original_timestamp: getCurrentTimeFormatted(),
      user_id: formoEvent.user_id,
      type: formoEvent.type,
      channel: CHANNEL,
      version: VERSION,
    };

    commonEventData.anonymous_id = generateAnonymousId(LOCAL_ANONYMOUS_ID_KEY);

    // Handle address - convert undefined to null for consistency
    const validAddress = getValidAddress(formoEvent.address);
    if (validAddress) {
      commonEventData.address = toChecksumAddress(validAddress);
    } else {
      commonEventData.address = null;
    }

    const processedEvent = mergeDeepRight(
      formoEvent as Record<string, unknown>,
      commonEventData as Record<string, unknown>
    ) as unknown as IFormoEvent;

    if (processedEvent.event === undefined) {
      processedEvent.event = null;
    }

    if (processedEvent.properties === undefined) {
      processedEvent.properties = null;
    }

    // Extract function_args before snake_case conversion to preserve ABI parameter names
    // (e.g., "tokenId" should not become "token_id" since it's a contract ABI name)
    const functionArgs = (processedEvent.properties as Record<string, unknown>)?.function_args;

    const converted = toSnakeCase(processedEvent as unknown as Record<string, unknown>) as unknown as IFormoEvent;

    // Re-attach function_args with original key casing
    if (functionArgs && converted.properties) {
      (converted.properties as Record<string, unknown>).function_args = functionArgs;
    }

    return converted;
  }

  /**
   * Generate screen view event as a page event for unified analytics.
   * Maps screen name to page-equivalent context fields (page_title, page_path, page_url)
   * so Tinybird materializations (process_sessions, process_sources) can process mobile
   * screen views alongside web page views. The channel="mobile" distinguishes the source.
   */
  async generateScreenEvent(
    name: string,
    category?: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const props = { ...(properties ?? {}), name, ...(category && { category }) };

    // Map screen name to page-equivalent context fields for Tinybird compatibility.
    // page_path is omitted — Tinybird derives it from page_url via path().
    // User-supplied context values take precedence (spread last).
    const screenContext: IFormoEventContext = {
      page_title: name,
      page_url: `app://${name}`,
      ...(context ?? {}),
    };

    const screenEvent: Partial<IFormoEvent> = {
      properties: props,
      type: "page",
    };

    return this.getEnrichedEvent(screenEvent, screenContext);
  }

  async generateDetectWalletEvent(
    providerName: string,
    rdns: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const detectEvent: Partial<IFormoEvent> = {
      properties: {
        providerName,
        rdns,
        ...properties,
      },
      type: "detect",
    };

    return this.getEnrichedEvent(detectEvent, context);
  }

  async generateIdentifyEvent(
    providerName: string,
    rdns: string,
    address: Nullable<Address>,
    userId?: Nullable<string>,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const identifyEvent: Partial<IFormoEvent> = {
      properties: {
        providerName,
        rdns,
        ...properties,
      },
      user_id: userId,
      address,
      type: "identify",
    };

    return this.getEnrichedEvent(identifyEvent, context);
  }

  async generateConnectEvent(
    chainId: ChainID,
    address: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const connectEvent: Partial<IFormoEvent> = {
      properties: {
        chainId,
        ...properties,
      },
      address,
      type: "connect",
    };

    return this.getEnrichedEvent(connectEvent, context);
  }

  async generateDisconnectEvent(
    chainId?: ChainID,
    address?: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const disconnectEvent: Partial<IFormoEvent> = {
      properties: {
        chainId,
        ...properties,
      },
      address,
      type: "disconnect",
    };

    return this.getEnrichedEvent(disconnectEvent, context);
  }

  async generateChainChangedEvent(
    chainId: ChainID,
    address: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const chainEvent: Partial<IFormoEvent> = {
      properties: {
        chainId,
        ...properties,
      },
      address,
      type: "chain",
    };

    return this.getEnrichedEvent(chainEvent, context);
  }

  async generateSignatureEvent(
    status: SignatureStatus,
    chainId: ChainID | undefined,
    address: Address,
    message: string,
    signatureHash?: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const signatureEvent: Partial<IFormoEvent> = {
      properties: {
        status,
        ...(chainId !== undefined && chainId !== null && { chainId }),
        message,
        ...(signatureHash && { signatureHash }),
        ...properties,
      },
      address,
      type: "signature",
    };

    return this.getEnrichedEvent(signatureEvent, context);
  }

  async generateTransactionEvent(
    status: TransactionStatus,
    chainId: ChainID,
    address: Address,
    data?: string,
    to?: string,
    value?: string,
    transactionHash?: string,
    function_name?: string,
    function_args?: Record<string, unknown>,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const transactionEvent: Partial<IFormoEvent> = {
      properties: {
        status,
        chainId,
        data,
        to,
        value,
        ...(transactionHash && { transactionHash }),
        ...(function_name && { function_name }),
        ...(function_args && { function_args }),
        ...properties,
      },
      address,
      type: "transaction",
    };

    return this.getEnrichedEvent(transactionEvent, context);
  }

  async generateTrackEvent(
    event: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent> {
    const trackEvent: Partial<IFormoEvent> = {
      properties: {
        ...properties,
        ...(properties?.revenue !== undefined && {
          revenue: Number(properties.revenue),
          currency: (typeof properties?.currency === "string"
            ? properties.currency
            : "USD"
          ).toLowerCase(),
        }),
        ...(properties?.points !== undefined && {
          points: Number(properties.points),
        }),
        ...(properties?.volume !== undefined && {
          volume: Number(properties.volume),
        }),
      },
      event,
      type: "track",
    };

    return this.getEnrichedEvent(trackEvent, context);
  }

  /**
   * Create event from API event type
   */
  async create(
    event: APIEvent,
    address?: Address,
    userId?: string
  ): Promise<IFormoEvent> {
    let formoEvent: Partial<IFormoEvent> = {};

    switch (event.type) {
      case "screen":
        formoEvent = await this.generateScreenEvent(
          event.name,
          event.category,
          event.properties,
          event.context
        );
        break;
      case "detect":
        formoEvent = await this.generateDetectWalletEvent(
          event.providerName,
          event.rdns,
          event.properties,
          event.context
        );
        break;
      case "identify":
        formoEvent = await this.generateIdentifyEvent(
          event.providerName,
          event.rdns,
          event.address,
          event.userId,
          event.properties,
          event.context
        );
        break;
      case "chain":
        formoEvent = await this.generateChainChangedEvent(
          event.chainId,
          event.address,
          event.properties,
          event.context
        );
        break;
      case "connect":
        formoEvent = await this.generateConnectEvent(
          event.chainId,
          event.address,
          event.properties,
          event.context
        );
        break;
      case "disconnect":
        formoEvent = await this.generateDisconnectEvent(
          event.chainId,
          event.address,
          event.properties,
          event.context
        );
        break;
      case "signature":
        formoEvent = await this.generateSignatureEvent(
          event.status,
          event.chainId,
          event.address,
          event.message,
          event.signatureHash,
          event.properties,
          event.context
        );
        break;
      case "transaction":
        formoEvent = await this.generateTransactionEvent(
          event.status,
          event.chainId,
          event.address,
          event.data,
          event.to,
          event.value,
          event.transactionHash,
          event.function_name,
          event.function_args,
          event.properties,
          event.context
        );
        break;
      case "track":
      default:
        formoEvent = await this.generateTrackEvent(
          event.event,
          event.properties,
          event.context
        );
        break;
    }

    // Set address if not already set by the specific event generator
    if (formoEvent.address === undefined || formoEvent.address === null) {
      const validAddress = getValidAddress(address);
      formoEvent.address = validAddress
        ? toChecksumAddress(validAddress)
        : null;
    }
    formoEvent.user_id = userId || null;

    return formoEvent as IFormoEvent;
  }
}

export { EventFactory };
