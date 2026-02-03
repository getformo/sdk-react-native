/**
 * FormoAnalytics for React Native
 *
 * Main SDK class for tracking wallet events and user analytics in mobile dApps
 */
import { AsyncStorageInterface } from "./lib/storage";
import { Address, ChainID, Config, IFormoAnalytics, IFormoEventContext, IFormoEventProperties, Options, SignatureStatus, TransactionStatus } from "./types";
export declare class FormoAnalytics implements IFormoAnalytics {
    readonly writeKey: string;
    options: Options;
    private session;
    private eventManager;
    private eventQueue;
    private wagmiHandler?;
    config: Config;
    currentChainId?: ChainID;
    currentAddress?: Address;
    currentUserId?: string;
    private constructor();
    /**
     * Initialize the SDK
     * @param writeKey - Your Formo write key
     * @param options - Configuration options
     * @param asyncStorage - AsyncStorage instance from @react-native-async-storage/async-storage
     */
    static init(writeKey: string, options?: Options, asyncStorage?: AsyncStorageInterface): Promise<FormoAnalytics>;
    /**
     * Track a screen view (mobile equivalent of page view)
     */
    screen(name: string, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
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
    setTrafficSourceFromUrl(url: string): void;
    /**
     * Reset the current user session
     */
    reset(): void;
    /**
     * Clean up resources
     */
    cleanup(): Promise<void>;
    /**
     * Track wallet connect event
     */
    connect({ chainId, address }: {
        chainId: ChainID;
        address: Address;
    }, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Track wallet disconnect event
     */
    disconnect(params?: {
        chainId?: ChainID;
        address?: Address;
    }, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Track chain change event
     */
    chain({ chainId, address }: {
        chainId: ChainID;
        address?: Address;
    }, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Track signature event
     */
    signature({ status, chainId, address, message, signatureHash, }: {
        status: SignatureStatus;
        chainId: ChainID;
        address: Address;
        message: string;
        signatureHash?: string;
    }, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Track transaction event
     */
    transaction({ status, chainId, address, data, to, value, transactionHash, }: {
        status: TransactionStatus;
        chainId: ChainID;
        address: Address;
        data?: string;
        to?: string;
        value?: string;
        transactionHash?: string;
    }, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Track identify event
     */
    identify(params: {
        address: Address;
        providerName?: string;
        userId?: string;
        rdns?: string;
    }, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Track detect wallet event
     */
    detect({ providerName, rdns }: {
        providerName: string;
        rdns: string;
    }, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Track custom event
     */
    track(event: string, properties?: IFormoEventProperties, context?: IFormoEventContext, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Opt out of tracking
     */
    optOutTracking(): void;
    /**
     * Opt back into tracking
     */
    optInTracking(): void;
    /**
     * Check if user has opted out
     */
    hasOptedOutTracking(): boolean;
    /**
     * Check if autocapture is enabled for event type
     */
    isAutocaptureEnabled(eventType: "connect" | "disconnect" | "signature" | "transaction" | "chain"): boolean;
    /**
     * Internal method to track events
     * This is the single enforcement point for shouldTrack() - all public tracking
     * methods (track, screen, connect, etc.) route through here
     */
    private trackEvent;
    /**
     * Check if tracking should be enabled
     */
    private shouldTrack;
    /**
     * Validate and checksum address
     */
    private validateAndChecksumAddress;
    /**
     * Flush pending events
     */
    flush(): Promise<void>;
}
//# sourceMappingURL=FormoAnalytics.d.ts.map