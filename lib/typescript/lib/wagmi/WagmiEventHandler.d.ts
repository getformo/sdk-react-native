/**
 * WagmiEventHandler for React Native
 *
 * Handles wallet event tracking by hooking into Wagmi v2's config.subscribe()
 * and TanStack Query's MutationCache.
 */
import { SignatureStatus, TransactionStatus } from "../../types/events";
import { WagmiConfig, QueryClient } from "./types";
interface IFormoAnalyticsInstance {
    connect(params: {
        chainId: number;
        address: string;
    }, properties?: Record<string, unknown>): Promise<void>;
    disconnect(params?: {
        chainId?: number;
        address?: string;
    }): Promise<void>;
    chain(params: {
        chainId: number;
        address?: string;
    }): Promise<void>;
    signature(params: {
        status: SignatureStatus;
        chainId: number;
        address: string;
        message: string;
        signatureHash?: string;
    }): Promise<void>;
    transaction(params: {
        status: TransactionStatus;
        chainId: number;
        address: string;
        data?: string;
        to?: string;
        value?: string;
        transactionHash?: string;
    }): Promise<void>;
    isAutocaptureEnabled(eventType: "connect" | "disconnect" | "signature" | "transaction" | "chain"): boolean;
}
export declare class WagmiEventHandler {
    private formo;
    private wagmiConfig;
    private queryClient?;
    private unsubscribers;
    private trackingState;
    private processedMutations;
    private pendingStatusChanges;
    constructor(formoAnalytics: IFormoAnalyticsInstance, wagmiConfig: WagmiConfig, queryClient?: QueryClient);
    /**
     * Set up listeners for wallet connection, disconnection, and chain changes
     */
    private setupConnectionListeners;
    private static readonly MAX_PENDING_STATUS_CHANGES;
    /**
     * Handle status changes (connect/disconnect)
     */
    private handleStatusChange;
    /**
     * Process a single status change (extracted for iterative processing)
     */
    private processStatusChange;
    /**
     * Handle chain ID changes
     */
    private handleChainChange;
    /**
     * Set up mutation tracking for signatures and transactions
     */
    private setupMutationTracking;
    /**
     * Handle mutation cache events
     */
    private handleMutationEvent;
    /**
     * Handle signature mutations
     */
    private handleSignatureMutation;
    /**
     * Handle transaction mutations
     */
    private handleTransactionMutation;
    /**
     * Get current Wagmi state
     */
    private getState;
    /**
     * Get connected address from state
     */
    private getConnectedAddress;
    /**
     * Get connector name from state
     */
    private getConnectorName;
    /**
     * Get connector ID from state (typically the rdns for EIP-6963 wallets)
     */
    private getConnectorId;
    /**
     * Clean up subscriptions
     */
    cleanup(): void;
}
export {};
//# sourceMappingURL=WagmiEventHandler.d.ts.map