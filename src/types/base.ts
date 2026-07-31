import { ReactNode } from "react";
import { LogLevel } from "../lib/logger";
import {
  IFormoEventContext,
  IFormoEventProperties,
  SignatureStatus,
  TransactionStatus,
} from "./events";

export type Nullable<T> = T | null;
// Decimal chain ID
export type ChainID = number;

// Address (EVM, Solana, etc.)
export type Address = string;

export type ValidInputTypes = Uint8Array | bigint | string | number | boolean;

export interface IFormoAnalytics {
  screen(
    name: string,
    category?: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;
  reset(): void;
  cleanup(): Promise<void>;
  detect(
    params: { rdns: string; providerName: string },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;
  connect(
    params: { chainId: ChainID; address: Address },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;
  disconnect(
    params?: { chainId?: ChainID; address?: Address },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;
  chain(
    params: { chainId: ChainID; address?: Address },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;
  signature(
    params: {
      status: SignatureStatus;
      chainId?: ChainID;
      address: Address;
      message: string;
    },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;
  transaction(
    params: {
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
  ): Promise<void>;
  identify(
    params: {
      address: Address;
      providerName?: string;
      userId?: string;
      rdns?: string;
    },
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;
  track(
    event: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;

  // Push notification lifecycle events. Not autocaptured: push delivery is
  // invisible to JavaScript without a native module, so the host app forwards
  // these from its own push handler.
  pushNotificationReceived(properties?: IFormoEventProperties): Promise<void>;
  pushNotificationTapped(properties?: IFormoEventProperties): Promise<void>;
  pushNotificationBounced(properties?: IFormoEventProperties): Promise<void>;

  // Event flushing
  flush(): Promise<void>;

  // Traffic source management
  setTrafficSourceFromUrl(url: string): void;

  // Consent management methods
  optOutTracking(): void;
  optInTracking(): void;
  hasOptedOutTracking(): boolean;
}

export interface Config {
  writeKey: string;
}

/**
 * Configuration options for controlling tracking exclusions
 */
export interface TrackingOptions {
  excludeChains?: ChainID[];
}

/**
 * Configuration options for controlling wallet event autocapture
 * All events are enabled by default unless explicitly set to false
 */
export interface AutocaptureOptions {
  /**
   * Track wallet connect events
   * @default true
   */
  connect?: boolean;

  /**
   * Track wallet disconnect events
   * @default true
   */
  disconnect?: boolean;

  /**
   * Track wallet signature events (personal_sign, eth_signTypedData_v4)
   * @default true
   */
  signature?: boolean;

  /**
   * Track wallet transaction events (eth_sendTransaction)
   * @default true
   */
  transaction?: boolean;

  /**
   * Track wallet chain change events
   * @default true
   */
  chain?: boolean;

  /**
   * Track application lifecycle events (installed, updated, opened, backgrounded)
   * @default true
   */
  lifecycle?: boolean;

  /**
   * Emit `Application Foregrounded` on every background → active transition,
   * in addition to the `Application Opened` (with `from_background: true`) that
   * already fires there.
   *
   * Off by default because it doubles foreground event volume and adds no
   * information: `Application Opened` with `from_background: true` already
   * marks the same transition. Enable it if you consume the Segment spec's
   * `Application Foregrounded` name directly — e.g. when migrating dashboards
   * or destinations from Segment or RudderStack. Requires `lifecycle`.
   * @default false
   */
  foregrounded?: boolean;

  /**
   * Track `Deep Link Opened` when the app is launched or resumed via a deep
   * link or universal link, with the `url` property.
   *
   * Independent of `attribution.deeplinks`, which controls whether the link's
   * UTM/referral parameters are parsed into event context. This option is only
   * about emitting the event; the SDK still needs `attribution.deeplinks` to
   * observe links at all.
   * @default true
   */
  deepLinks?: boolean;

  /**
   * Track `Application Crashed` on unhandled JavaScript errors, with the error
   * message, stack, and whether React Native considered it fatal.
   *
   * Off by default because enabling it installs a global error handler
   * (`ErrorUtils.setGlobalHandler`). The previous handler is always invoked
   * afterwards, so React Native's redbox and any crash reporter you already use
   * keep working — but installing one implicitly on an SDK upgrade is a
   * surprise, so it is opt-in. Covers JS errors only: native crashes need a
   * native crash reporter.
   * @default false
   */
  crashes?: boolean;
}

/**
 * Configuration options for attribution capture.
 *
 * Attribution is not an event type — it's context enrichment that decorates
 * every tracked event with `utm_*`, `ref`, and `referrer` fields. These
 * options control the SDK's automatic attribution data sources.
 */
export interface AttributionOptions {
  /**
   * Capture traffic source from deep links via React Native's Linking API.
   * When enabled, the SDK calls Linking.getInitialURL() on init and subscribes
   * to the `url` event, parsing UTM parameters and referral codes into the
   * event context.
   * @default true
   */
  deeplinks?: boolean;

  /**
   * Capture install-time attribution on first launch:
   * - Android: Google Play Install Referrer API (requires react-native-play-install-referrer).
   *   Enables web-to-mobile attribution, e.g. referrer=example.com.
   * - iOS: not supported — Apple exposes no install-referrer API, so this is a no-op.
   *
   * Resolved once on first successful fetch and cached; subsequent launches
   * skip the native call. Silently no-ops when the optional native module
   * is not installed.
   * @default true
   */
  installReferrer?: boolean;
}

/**
 * Configuration options for Wagmi integration
 * Allows the SDK to hook into Wagmi v2 wallet events
 */
export interface WagmiOptions {
  /**
   * Wagmi config instance from createConfig()
   * The SDK will subscribe to this config's state changes to track wallet events
   */
  config: any;

  /**
   * Optional QueryClient instance from @tanstack/react-query
   * Required for tracking signature and transaction events via mutation cache
   * If not provided, only connection/disconnection/chain events will be tracked
   */
  queryClient?: any;
}

/**
 * App information for context enrichment
 */
export interface AppInfo {
  /**
   * App name
   */
  name?: string;

  /**
   * App version
   */
  version?: string;

  /**
   * App build number
   */
  build?: string;

  /**
   * Bundle/package identifier
   */
  bundleId?: string;
}

/**
 * Configuration options for custom referral query parameter parsing
 */
export interface ReferralOptions {
  /**
   * Custom query parameter names to check for referral codes
   * These are checked in addition to the defaults: ref, referral, refcode, referrer_code
   */
  queryParams?: string[];
  /**
   * Path pattern for extracting referral codes from URL paths
   */
  pathPattern?: string;
}

export interface Options {
  tracking?: boolean | TrackingOptions;
  /**
   * Control wallet event autocapture
   * - `false`: Disable all wallet autocapture
   * - `true`: Enable all wallet events (default)
   * - `AutocaptureOptions`: Granular control over specific events
   * @default true
   */
  autocapture?: boolean | AutocaptureOptions;
  /**
   * Control attribution context capture (deep links and install referrer).
   * Attribution decorates every tracked event with `utm_*`, `ref`, and
   * `referrer` fields — it is not itself an event type.
   * - `false`: Disable all attribution capture
   * - `true`: Enable all attribution sources (default)
   * - `AttributionOptions`: Granular control over specific sources
   * @default true
   */
  attribution?: boolean | AttributionOptions;
  /**
   * Wagmi integration configuration
   * When provided, the SDK will hook into Wagmi's event system
   * @requires wagmi@>=2.0.0
   * @requires @tanstack/react-query@>=5.0.0 (for mutation tracking)
   */
  wagmi?: WagmiOptions;
  /**
   * Custom API host for sending events
   */
  apiHost?: string;
  flushAt?: number;
  flushInterval?: number;
  retryCount?: number;
  maxQueueSize?: number;
  logger?: {
    enabled?: boolean;
    levels?: LogLevel[];
  };
  /**
   * App information for context enrichment
   */
  app?: AppInfo;
  /**
   * Custom referral query parameter configuration
   */
  referral?: ReferralOptions;
  /**
   * Global error handler for SDK errors
   */
  errorHandler?: (err: Error) => void;
  ready?: (formo: IFormoAnalytics) => void;
}

export interface FormoAnalyticsProviderProps {
  writeKey: string;
  options?: Options;
  disabled?: boolean;
  /**
   * AsyncStorage instance from @react-native-async-storage/async-storage
   * Required for persistent storage
   */
  asyncStorage?: import("../lib/storage").AsyncStorageInterface;
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
  children: ReactNode;
}
