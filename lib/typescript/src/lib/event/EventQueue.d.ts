import { IFormoEvent } from "../../types";
import { IEventQueue } from "./types";
interface Options {
    apiHost: string;
    flushAt?: number;
    flushInterval?: number;
    retryCount?: number;
    maxQueueSize?: number;
}
/**
 * Event queue for React Native
 * Handles batching, flushing, and retries with app lifecycle awareness
 */
export declare class EventQueue implements IEventQueue {
    private writeKey;
    private apiHost;
    private queue;
    private timer;
    private flushAt;
    private flushIntervalMs;
    private maxQueueSize;
    private retryCount;
    private payloadHashes;
    private flushMutex;
    private appStateSubscription;
    constructor(writeKey: string, options: Options);
    /**
     * Set up listener for app state changes
     * Flush events when app goes to background
     */
    private setupAppStateListener;
    /**
     * Handle app state changes
     */
    private handleAppStateChange;
    /**
     * Generate message ID for deduplication
     */
    private generateMessageId;
    /**
     * Check if event is a duplicate
     */
    private isDuplicate;
    /**
     * Add event to queue
     */
    enqueue(event: IFormoEvent, callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Flush events to API
     * Uses a mutex to ensure only one flush operation runs at a time,
     * preventing race conditions with re-queued items on failure.
     */
    flush(callback?: (...args: unknown[]) => void): Promise<void>;
    /**
     * Send events with retry logic
     */
    private sendWithRetry;
    /**
     * Check if error should be retried
     */
    private shouldRetry;
    /**
     * Discard all pending events without sending them.
     * Used when the user opts out of tracking to prevent queued events
     * from being sent after consent is revoked.
     */
    clear(): void;
    /**
     * Clean up resources, flushing any pending events first
     */
    cleanup(): Promise<void>;
}
export {};
//# sourceMappingURL=EventQueue.d.ts.map