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
import {
  COUNTRY_LIST,
  LOCAL_ANONYMOUS_ID_KEY,
  LOCAL_SESSION_ID_KEY,
  LOCAL_SESSION_LAST_ACTIVITY_KEY,
  SESSION_TIMEOUT_MS,
  CHANNEL,
  VERSION,
} from "../../constants";
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
  validateAddress,
  toSnakeCase,
  mergeDeepRight,
  getStoredTrafficSource,
} from "../../utils";
import { getCurrentTimeFormatted } from "../../utils/timestamp";
import { generateUUID } from "../../utils/hash";
import { logger } from "../logger";
import { storage } from "../storage";
import {
  EVENT_CREATION_CANCELLED,
  EventCreationGuard,
  IEventFactory,
} from "./types";
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
 * Get the current session id, or start a new one.
 *
 * A session persists across app restarts but expires after SESSION_TIMEOUT_MS of
 * inactivity, at which point a fresh id is minted. Every call refreshes the
 * last-activity marker.
 *
 * The mobile SDK owns its session_id rather than letting ingestion derive one.
 * The events-gateway authorizer computes
 * `hash(dailySalt + domain + sourceIp + userAgent)` — a design built for the
 * web, where all three inputs carry real entropy. For a native app they all
 * degenerate at once: there is no Origin header (so `domain` is the constant
 * "unknown"), the HTTP User-Agent is the client library's (`okhttp/…`,
 * `CFNetwork/… Darwin/…`) and is near-identical across users on the same app
 * build, and carrier CGNAT puts many users behind one IP — so unrelated users
 * collapse into a single session. Ingestion honours a body-provided session_id
 * (`obj?.session_id || session_id` in handlerV0), which is the path used here.
 */
export function getSessionId(): string {
  const now = Date.now();
  const existingId = storage().get(LOCAL_SESSION_ID_KEY);
  const lastActivityRaw = storage().get(LOCAL_SESSION_LAST_ACTIVITY_KEY);
  const lastActivity = lastActivityRaw ? parseInt(lastActivityRaw, 10) : 0;

  const isExpired =
    !existingId || !lastActivity || now - lastActivity > SESSION_TIMEOUT_MS;
  const sessionId = isExpired ? generateUUID() : existingId;

  storage().set(LOCAL_SESSION_ID_KEY, sessionId);
  storage().set(LOCAL_SESSION_LAST_ACTIVITY_KEY, String(now));

  return sessionId;
}

/**
 * Build a representative User-Agent string from structured device info.
 *
 * The ingestion pipeline classifies device / os / browser purely from the
 * user_agent string; a mobile event with an empty UA is bucketed as "unknown".
 * Platforms without a native UA (e.g. Expo, where DeviceInfo.getUserAgent() is
 * unavailable) would otherwise report device=os=unknown. We synthesize a UA
 * containing the tokens the classifier keys off (iphone/ipad/android + version)
 * so mobile device and OS resolve correctly. Returns "" for unknown platforms.
 */
/**
 * Resolve `device_type` from expo-device's `deviceType` enum.
 *
 * Extracted and guarded because the Expo branch of getDeviceInfo() runs when
 * EITHER expo-device or expo-application is installed, so `deviceType` may be
 * undefined. A bare `deviceType === DeviceType.TABLET` is then
 * `undefined === undefined` — true — and every device reports as a tablet,
 * which also flips the synthesized user agent to iPad/Tablet and corrupts
 * device breakdowns downstream. Unknown means "mobile", the safe default for a
 * React Native app.
 */
interface DeviceInfoResult {
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
}

/**
 * Compose a screen view's `page_url` as `app://<bundle id>/<screen>`.
 *
 * Well-formed on purpose: the bundle id occupies the authority slot and the
 * screen the path, so a standard URL parser yields both without any
 * mobile-specific handling — the same shape as `https://<host>/<path>`.
 *
 * @param bundleId Application bundle id, e.g. "com.acme.wallet". When empty the
 *   authority is omitted (`app:///<screen>`), which still parses to a correct
 *   path; the pipeline resolves origin from context in that case.
 * @param name Screen name. Leading slashes are stripped so a router-style name
 *   ("/tabs/leaderboard") does not produce a doubled separator.
 */
export function buildScreenUrl(bundleId: string, name: string): string {
  const screen = (name ?? "")
    .replace(/^\/+/, "")
    // Percent-encode the characters that would otherwise change the URL's
    // STRUCTURE rather than its path. '?' starts a query and '#' a fragment, so
    // screen("Checkout?coupon=X") would parse with pathname "/Checkout" and the
    // rest silently dropped from the screen name. '/' is deliberately NOT
    // encoded — router-style names like "/tabs/leaderboard" are meant to be
    // path segments.
    // '%' FIRST, so the transform stays injective. Without it a screen literally
    // named "Checkout%3Fx" and one named "Checkout?x" both produce
    // ".../Checkout%3Fx" and two distinct screens merge in the analytics.
    .replace(/%/g, "%25")
    .replace(/\?/g, "%3F")
    .replace(/#/g, "%23");
  return `app://${bundleId ?? ""}/${screen}`;
}

export function resolveExpoDeviceType(
  deviceType: number | null | undefined,
  tabletEnumValue: number | null | undefined,
): "tablet" | "mobile" {
  if (deviceType == null || tabletEnumValue == null) return "mobile";
  return deviceType === tabletEnumValue ? "tablet" : "mobile";
}

export function synthesizeUserAgent(info: {
  os_name: string;
  os_version: string;
  device_model: string;
  device_type: string;
}): string {
  const os = (info.os_name || "").toLowerCase();
  const version = info.os_version || "";
  const model = info.device_model || "";
  const isTablet = info.device_type === "tablet";

  if (os === "ios" || os === "ipados") {
    const device = isTablet ? "iPad" : "iPhone";
    const osVersion = version.replace(/\./g, "_");
    return `Mozilla/5.0 (${device}; CPU ${device} OS ${osVersion} like Mac OS X) FormoAnalytics/ReactNative`;
  }
  if (os === "android") {
    const formFactor = isTablet ? "Tablet" : "Mobile";
    return `Mozilla/5.0 (Linux; Android ${version}; ${model}) ${formFactor} FormoAnalytics/ReactNative`;
  }
  return "";
}

/**
 * Event factory for React Native
 * Creates event payloads with mobile-specific context
 */
class EventFactory implements IEventFactory {
  private options?: Options;
  /** Memoised device/app identity — see getDeviceInfo(). */
  private deviceInfoPromise?: Promise<DeviceInfoResult>;

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
  /**
   * The app bundle id as it will appear in context.
   *
   * Must mirror generateContext's precedence: an explicitly configured
   * `options.app.bundleId` overrides whatever the native modules report. Reading
   * getDeviceInfo() alone would ignore that configuration and silently fall back
   * to the authority-less URL form — and on React Native Web, where neither
   * react-native-device-info nor expo-application resolves a bundle id, that is
   * the ONLY value available.
   */
  private async resolveAppBundleId(): Promise<string> {
    return (
      this.options?.app?.bundleId || (await this.getDeviceInfo()).app_bundle_id || ""
    );
  }

  private async getDeviceInfo(): Promise<DeviceInfoResult> {
    // Device and app identity do not change for the lifetime of the process,
    // and resolving them crosses the native bridge. Memoise the promise so
    // every event after the first is free, and so callers that need only the
    // app identifier (screen events) can ask without paying twice.
    this.deviceInfoPromise ??= this.resolveDeviceInfo();
    return this.deviceInfoPromise;
  }

  private async resolveDeviceInfo(): Promise<DeviceInfoResult> {
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

        const device_type = isTablet ? "tablet" : "mobile";
        const os_version = DeviceInfo.getSystemVersion();
        return {
          os_name: Platform.OS,
          os_version,
          device_model: model,
          device_manufacturer: manufacturer,
          device_name: deviceName,
          device_type,
          // Prefer the native UA; fall back to a synthesized one if unavailable.
          user_agent:
            userAgent ||
            synthesizeUserAgent({
              os_name: Platform.OS,
              os_version,
              device_model: model,
              device_type,
            }),
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
        const os_name = ExpoDevice?.osName || Platform.OS;
        const os_version = ExpoDevice?.osVersion || String(Platform.Version);
        const device_model = ExpoDevice?.modelName || "Unknown";
        const device_type = resolveExpoDeviceType(
          ExpoDevice?.deviceType,
          ExpoDevice?.DeviceType?.TABLET,
        );
        return {
          os_name,
          os_version,
          device_model,
          device_manufacturer: ExpoDevice?.manufacturer || "Unknown",
          device_name: ExpoDevice?.deviceName || "Unknown Device",
          device_type,
          // Expo exposes no native UA; synthesize one so the pipeline can
          // classify device/os (both are derived from the UA string).
          user_agent: synthesizeUserAgent({
            os_name,
            os_version,
            device_model,
            device_type,
          }),
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
    const os_name = Platform.OS;
    const os_version = String(Platform.Version);
    return {
      os_name,
      os_version,
      device_model: "Unknown",
      device_manufacturer: "Unknown",
      device_name: "Unknown Device",
      device_type: "mobile",
      user_agent: synthesizeUserAgent({
        os_name,
        os_version,
        device_model: "Unknown",
        device_type: "mobile",
      }),
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
    context?: IFormoEventContext,
    shouldContinue: EventCreationGuard = () => true
  ): Promise<IFormoEvent> {
    const generatedContext = await this.generateContext(context);
    if (!shouldContinue()) throw EVENT_CREATION_CANCELLED;

    const commonEventData: Partial<IFormoEvent> = {
      context: generatedContext,
      original_timestamp: getCurrentTimeFormatted(),
      user_id: formoEvent.user_id,
      type: formoEvent.type,
      channel: CHANNEL,
      version: VERSION,
    };

    commonEventData.anonymous_id = generateAnonymousId(LOCAL_ANONYMOUS_ID_KEY);
    commonEventData.session_id = getSessionId();

    // Handle address - convert undefined to null for consistency
    // Try EVM first, then Solana fallback (chainId is not always present here).
    const validAddress = formoEvent.address
      ? validateAddress(formoEvent.address)
      : undefined;
    commonEventData.address = validAddress ?? null;

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
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
  ): Promise<IFormoEvent> {
    const props = { ...(properties ?? {}), name, ...(category && { category }) };

    // Map screen name to page-equivalent context fields so mobile screens flow
    // through the same analytics as web page views.
    //
    // The URL is app://<bundle id>/<screen>, which is a WELL-FORMED URL: the
    // bundle id is the authority and the screen is the path, exactly mirroring
    // https://<host>/<path> on web. That is what lets the ingestion pipeline
    // parse it with the same URL functions it uses for web — the authority
    // becomes `origin` and the path becomes `page_path`, with no mobile
    // special-casing.
    //
    // The earlier form was app://<screen>, which is malformed: the screen name
    // lands in the authority slot and there is no path at all, so a URL parser
    // yields an empty path and the pipeline had to reconstruct both fields by
    // hand. The bundle id is also the right choice of authority because, like a
    // hostname, it is stable and globally unique — a display name is neither.
    //
    // Falls back to an empty authority (app:///<screen>) when the bundle id is
    // unavailable, which keeps the path parseable and lets the pipeline resolve
    // origin from context instead.
    // User-supplied context values take precedence (spread last).
    const screenContext: IFormoEventContext = {
      page_title: name,
      page_url: buildScreenUrl(await this.resolveAppBundleId(), name),
      ...(context ?? {}),
    };

    const screenEvent: Partial<IFormoEvent> = {
      properties: props,
      type: "page",
    };

    return this.getEnrichedEvent(screenEvent, screenContext, shouldContinue);
  }

  async generateDetectWalletEvent(
    providerName: string,
    rdns: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
  ): Promise<IFormoEvent> {
    const detectEvent: Partial<IFormoEvent> = {
      properties: {
        providerName,
        rdns,
        ...properties,
      },
      type: "detect",
    };

    return this.getEnrichedEvent(detectEvent, context, shouldContinue);
  }

  async generateIdentifyEvent(
    providerName: string,
    rdns: string,
    address: Nullable<Address>,
    userId?: Nullable<string>,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
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

    return this.getEnrichedEvent(identifyEvent, context, shouldContinue);
  }

  async generateConnectEvent(
    chainId: ChainID,
    address: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
  ): Promise<IFormoEvent> {
    const connectEvent: Partial<IFormoEvent> = {
      properties: {
        chainId,
        ...properties,
      },
      address,
      type: "connect",
    };

    return this.getEnrichedEvent(connectEvent, context, shouldContinue);
  }

  async generateDisconnectEvent(
    chainId?: ChainID,
    address?: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
  ): Promise<IFormoEvent> {
    const disconnectEvent: Partial<IFormoEvent> = {
      properties: {
        chainId,
        ...properties,
      },
      address,
      type: "disconnect",
    };

    return this.getEnrichedEvent(disconnectEvent, context, shouldContinue);
  }

  async generateChainChangedEvent(
    chainId: ChainID,
    address: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
  ): Promise<IFormoEvent> {
    const chainEvent: Partial<IFormoEvent> = {
      properties: {
        chainId,
        ...properties,
      },
      address,
      type: "chain",
    };

    return this.getEnrichedEvent(chainEvent, context, shouldContinue);
  }

  async generateSignatureEvent(
    status: SignatureStatus,
    chainId: ChainID | undefined,
    address: Address,
    message: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
  ): Promise<IFormoEvent> {
    const signatureEvent: Partial<IFormoEvent> = {
      properties: {
        status,
        ...(chainId !== undefined && chainId !== null && { chainId }),
        message,
        ...properties,
      },
      address,
      type: "signature",
    };

    return this.getEnrichedEvent(signatureEvent, context, shouldContinue);
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
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
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

    return this.getEnrichedEvent(transactionEvent, context, shouldContinue);
  }

  async generateTrackEvent(
    event: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    shouldContinue?: EventCreationGuard
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

    return this.getEnrichedEvent(trackEvent, context, shouldContinue);
  }

  /**
   * Create event from API event type
   */
  async create(
    event: APIEvent,
    address?: Address,
    userId?: string,
    shouldContinue?: EventCreationGuard
  ): Promise<IFormoEvent> {
    let formoEvent: Partial<IFormoEvent> = {};

    switch (event.type) {
      case "screen":
        formoEvent = await this.generateScreenEvent(
          event.name,
          event.category,
          event.properties,
          event.context,
          shouldContinue
        );
        break;
      case "detect":
        formoEvent = await this.generateDetectWalletEvent(
          event.providerName,
          event.rdns,
          event.properties,
          event.context,
          shouldContinue
        );
        break;
      case "identify":
        formoEvent = await this.generateIdentifyEvent(
          event.providerName,
          event.rdns,
          event.address,
          event.userId,
          event.properties,
          event.context,
          shouldContinue
        );
        break;
      case "chain":
        formoEvent = await this.generateChainChangedEvent(
          event.chainId,
          event.address,
          event.properties,
          event.context,
          shouldContinue
        );
        break;
      case "connect":
        formoEvent = await this.generateConnectEvent(
          event.chainId,
          event.address,
          event.properties,
          event.context,
          shouldContinue
        );
        break;
      case "disconnect":
        formoEvent = await this.generateDisconnectEvent(
          event.chainId,
          event.address,
          event.properties,
          event.context,
          shouldContinue
        );
        break;
      case "signature":
        formoEvent = await this.generateSignatureEvent(
          event.status,
          event.chainId,
          event.address,
          event.message,
          event.properties,
          event.context,
          shouldContinue
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
          event.context,
          shouldContinue
        );
        break;
      case "track":
      default:
        formoEvent = await this.generateTrackEvent(
          event.event,
          event.properties,
          event.context,
          shouldContinue
        );
        break;
    }

    // Set address if not already set by the specific event generator
    if (formoEvent.address === undefined || formoEvent.address === null) {
      formoEvent.address = address ? validateAddress(address) ?? null : null;
    }
    formoEvent.user_id = userId || null;

    return formoEvent as IFormoEvent;
  }
}

export { EventFactory };
