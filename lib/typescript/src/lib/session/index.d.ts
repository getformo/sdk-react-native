import { SESSION_WALLET_DETECTED_KEY, SESSION_WALLET_IDENTIFIED_KEY } from "../../constants";
export { SESSION_WALLET_DETECTED_KEY, SESSION_WALLET_IDENTIFIED_KEY };
/**
 * Session manager for tracking wallet detection and identification
 * Uses in-memory state that resets on app restart
 */
export declare class FormoAnalyticsSession {
    private detectedWallets;
    private identifiedWallets;
    constructor();
    /**
     * Load session state from storage
     */
    private loadFromStorage;
    /**
     * Save session state to storage
     */
    private saveToStorage;
    /**
     * Check if a wallet has been detected in this session
     */
    isWalletDetected(rdns: string): boolean;
    /**
     * Mark a wallet as detected
     */
    markWalletDetected(rdns: string): void;
    /**
     * Check if a wallet + address combination has been identified
     */
    isWalletIdentified(address: string, rdns: string): boolean;
    /**
     * Mark a wallet + address combination as identified
     */
    markWalletIdentified(address: string, rdns: string): void;
    /**
     * Clear all session data
     */
    clear(): void;
}
//# sourceMappingURL=index.d.ts.map