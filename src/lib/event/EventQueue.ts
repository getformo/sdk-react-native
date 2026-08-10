import { AppState, AppStateStatus } from "react-native";
import { IFormoEvent, IFormoEventPayload } from "../../types";
import { EVENTS_API_REQUEST_HEADER } from "../../constants";
import {
  clampNumber,
  getActionDescriptor,
  millisecondsToSecond,
  isNetworkError,
} from "../../utils";
import { hash } from "../../utils/hash";
import { toDateHourMinute } from "../../utils/timestamp";
import { logger } from "../logger";
import { IEventQueue } from "./types";

type QueueItem = {
  message: IFormoEventPayload;
  callback: (...args: unknown[]) => void;
  hash: string;
};

type IFormoEventFlushPayload = IFormoEventPayload & {
  sent_at: string;
};

/**
 * A send failure tagged with whether another attempt could ever succeed.
 * `retryable: false` means the API rejected the payload itself (4xx other
 * than 429) — re-posting the identical batch will fail identically forever.
 * Left undefined for unexpected errors, which are treated as retryable so an
 * unrecognised fault never silently discards events.
 */
type SendError = Error & { retryable?: boolean };

interface Options {
  apiHost: string;
  flushAt?: number;
  flushInterval?: number;
  retryCount?: number;
  maxQueueSize?: number;
}

const DEFAULT_RETRY = 3;
const MAX_RETRY = 5;
const MIN_RETRY = 1;

const DEFAULT_FLUSH_AT = 20;
const MAX_FLUSH_AT = 20;
const MIN_FLUSH_AT = 1;

const DEFAULT_QUEUE_SIZE = 1_024 * 500; // 500kB
const MAX_QUEUE_SIZE = 1_024 * 500; // 500kB
const MIN_QUEUE_SIZE = 200; // 200 bytes

// How long cleanup() waits for an already-in-flight send before abandoning it.
// Teardown must finish promptly: the provider blocks re-initialization on the
// pending cleanup, so an unbounded wait would strand the SDK.
const CLEANUP_FLUSH_WAIT = 1_000 * 5; // 5 seconds

const DEFAULT_FLUSH_INTERVAL = 1_000 * 30; // 30 seconds
const MAX_FLUSH_INTERVAL = 1_000 * 300; // 5 minutes
const MIN_FLUSH_INTERVAL = 1_000 * 10; // 10 seconds

const noop = () => {};

/**
 * Invoke a consumer-supplied callback without letting it escape the SDK.
 * These callbacks are arbitrary app code; a throw from one must not surface
 * as an unhandled rejection from flush() or abort the remaining callbacks.
 */
const safeCall = (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => {
  try {
    const result = fn(...args);
    // An `async` callback signals failure by returning a rejected promise
    // rather than throwing, which the catch below would never see.
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      Promise.resolve(result).catch((error) => {
        logger.error("EventQueue: Async callback rejected, ignoring", error);
      });
    }
  } catch (error) {
    logger.error("EventQueue: Callback threw, ignoring", error);
  }
};

/**
 * Event queue for React Native
 * Handles batching, flushing, and retries with app lifecycle awareness
 */
export class EventQueue implements IEventQueue {
  private writeKey: string;
  private apiHost: string;
  private queue: QueueItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushAt: number;
  private flushIntervalMs: number;
  private maxQueueSize: number;
  private retryCount: number;
  private payloadHashes: Set<string> = new Set();
  private flushMutex: Promise<void> = Promise.resolve();
  private appStateSubscription: { remove: () => void } | null = null;
  /**
   * Whether anything has been flushed yet this app session. Starts false so
   * the first event is sent immediately (see enqueue). A cold start opened
   * from an ad click or deep link produces its attribution events right away,
   * and those are exactly the events lost if the process is killed before the
   * batch timer fires or AppState reports background — a force-quit from the
   * app switcher, an OS memory kill, or a crash never gives us that chance.
   */
  private flushed = false;
  /**
   * Set once cleanup starts. A flush already in flight can fail and re-queue
   * its items after teardown has begun; without this it would arm a timer on
   * an instance that is going away, firing network calls post-cleanup.
   */
  private closed = false;
  /**
   * Bumped by clear(). flush() splices its batch out of the queue before
   * sending, so a clear() during opt-out cannot see those items; without this
   * a later send failure would unshift them back and they would be delivered
   * after consent was withdrawn.
   */
  private generation = 0;

  constructor(writeKey: string, options: Options) {
    this.writeKey = writeKey;
    this.apiHost = options.apiHost;
    this.retryCount = clampNumber(
      options.retryCount || DEFAULT_RETRY,
      MAX_RETRY,
      MIN_RETRY
    );
    this.flushAt = clampNumber(
      options.flushAt || DEFAULT_FLUSH_AT,
      MAX_FLUSH_AT,
      MIN_FLUSH_AT
    );
    this.maxQueueSize = clampNumber(
      options.maxQueueSize || DEFAULT_QUEUE_SIZE,
      MAX_QUEUE_SIZE,
      MIN_QUEUE_SIZE
    );
    this.flushIntervalMs = clampNumber(
      options.flushInterval || DEFAULT_FLUSH_INTERVAL,
      MAX_FLUSH_INTERVAL,
      MIN_FLUSH_INTERVAL
    );
    // Set up app state listener for React Native
    this.setupAppStateListener();
  }

  /**
   * Set up listener for app state changes
   * Flush events when app goes to background
   */
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      "change",
      this.handleAppStateChange.bind(this)
    );
  }

  /**
   * Handle app state changes
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    // Teardown is already draining the queue. A flush queued here would wait
    // on the mutex and could run — and re-queue on failure — after cleanup()
    // has returned, leaving network work with no owner.
    if (this.closed) return;

    // Flush when app goes to background or becomes inactive
    if (nextAppState === "background" || nextAppState === "inactive") {
      logger.debug("EventQueue: App going to background, flushing events");
      this.flush().catch((error) => {
        logger.error("EventQueue: Failed to flush on background", error);
      });
    }
  }

  /**
   * Generate message ID for deduplication
   */
  private async generateMessageId(event: IFormoEvent): Promise<string> {
    const formattedTimestamp = toDateHourMinute(
      new Date(event.original_timestamp)
    );
    const eventForHashing = { ...event, original_timestamp: formattedTimestamp };
    const eventString = JSON.stringify(eventForHashing);
    return hash(eventString);
  }

  /**
   * Check if event is a duplicate
   */
  private isDuplicate(eventId: string): boolean {
    if (this.payloadHashes.has(eventId)) return true;
    this.payloadHashes.add(eventId);
    return false;
  }

  /**
   * Add event to queue
   */
  async enqueue(
    event: IFormoEvent,
    callback?: (...args: unknown[]) => void
  ): Promise<void> {
    if (this.closed) {
      logger.debug("EventQueue: Ignoring event enqueued after cleanup");
      return;
    }

    callback = callback || noop;

    const generation = this.generation;
    const message_id = await this.generateMessageId(event);

    // Hashing is async, so cleanup() can complete while this call is suspended
    // above. Re-check, or a caller that did not await enqueue() would resume
    // after teardown, push onto a queue nobody will drain, and — if this is the
    // session's first event — fire a network request on a torn-down instance.
    if (this.closed) {
      logger.debug("EventQueue: Ignoring event enqueued after cleanup");
      return;
    }

    // Same window, but for opt-out: clear() cannot see an event that has not
    // reached the queue yet, so an enqueue suspended across it would land
    // afterwards and be delivered despite consent having been withdrawn.
    if (this.generation !== generation) {
      logger.debug("EventQueue: Ignoring event enqueued before opt-out");
      return;
    }

    // Check for duplicate
    if (this.isDuplicate(message_id)) {
      logger.warn(
        `Event already enqueued, try again after ${millisecondsToSecond(
          this.flushIntervalMs
        )} seconds.`
      );
      return;
    }

    this.queue.push({
      message: { ...event, message_id },
      callback,
      hash: message_id,
    });

    logger.log(
      `Event enqueued: ${getActionDescriptor(event.type, event.properties)}`
    );

    // Per-event detail line for debugging (only prints when debug logging is on).
    const ctx = (event.context ?? {}) as Record<string, unknown>;
    logger.debug(
      "Event detail:",
      JSON.stringify({
        type: event.type,
        event: event.event,
        session_id: event.session_id,
        anonymous_id: event.anonymous_id,
        user_agent: ctx.user_agent,
        page_url: ctx.page_url,
      })
    );

    const hasReachedFlushAt = this.queue.length >= this.flushAt;
    const hasReachedQueueSize =
      this.queue.reduce(
        (acc, item) => acc + JSON.stringify(item).length,
        0
      ) >= this.maxQueueSize;

    // Ship the first event of the app session as a batch of one rather than
    // holding it for flushAt/flushInterval; subsequent events keep batching.
    if (hasReachedFlushAt || hasReachedQueueSize || !this.flushed) {
      // Clear timer to prevent double flush
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.flushed = true;
      // Flush uses internal mutex to serialize operations
      // A failed flush re-queues its items and re-arms the interval itself, so
      // a cold start whose immediate flush fails — the likeliest case, since
      // the radio may still be waking — still retries the attribution event.
      this.flush().catch((error) => {
        logger.error("EventQueue: Failed to flush on threshold", error);
      });
      return;
    }

    this.scheduleFlush();
  }

  /**
   * Arm the batch-interval timer, if there is queued work and nothing is
   * already scheduled. Safe to call repeatedly; it never stacks timers.
   */
  private scheduleFlush(): void {
    if (this.closed) return;
    if (!this.flushIntervalMs || this.timer || !this.queue.length) return;

    this.timer = setTimeout(() => {
      // flush() rethrows once sendWithRetry is exhausted. Passing it to
      // setTimeout bare left that rejection unhandled, surfacing in the host
      // app as an "Uncaught (in promise)" on every failed interval flush —
      // observed against a 4xx from the events API. The threshold and
      // background paths already log and swallow; this one has to as well.
      // flush() re-arms on failure, so a queue that outlives a transient
      // outage keeps retrying and drains once connectivity returns.
      this.flush().catch((error) => {
        logger.error("EventQueue: Failed to flush on interval", error);
      });
    }, this.flushIntervalMs);
  }

  /**
   * Flush events to API
   * Uses a mutex to ensure only one flush operation runs at a time,
   * preventing race conditions with re-queued items on failure.
   */
  async flush(callback?: (...args: unknown[]) => void): Promise<void> {
    callback = callback || noop;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Use mutex to serialize flush operations and prevent race conditions
    const previousMutex = this.flushMutex;
    let resolveMutex: () => void;
    this.flushMutex = new Promise((resolve) => {
      resolveMutex = resolve;
    });

    try {
      // Wait for any previous flush to complete
      await previousMutex;

      if (!this.queue.length) {
        safeCall(callback);
        return;
      }

      const items = this.queue.splice(0, this.flushAt);
      // Snapshot after the splice: from here on these items live only in this
      // closure, so a clear() cannot reach them and we have to detect it.
      const generation = this.generation;

      const sentAt = new Date().toISOString();
      const data: IFormoEventFlushPayload[] = items.map((item) => ({
        ...item.message,
        sent_at: sentAt,
      }));

      const done = (err?: Error) => {
        items.forEach(({ message, callback: itemCallback }) =>
          safeCall(itemCallback, err, message, data)
        );
        safeCall(callback!, err, data);
      };

      try {
        await this.sendWithRetry(data, generation);
        // Only remove hashes after successful send, and only if clear() has
        // not run meanwhile: it already emptied the set, so an identical event
        // may have been enqueued since and now owns that hash. Deleting it
        // here would strip the new item's dedup entry and let a duplicate
        // through.
        if (this.generation === generation) {
          items.forEach((item) => this.payloadHashes.delete(item.hash));
        }
        done();
        logger.info(`Events sent successfully: ${data.length} events`);
      } catch (err) {
        if (this.generation !== generation) {
          // clear() ran while this batch was in flight — the consumer opted
          // out. Putting these back would deliver events after consent was
          // withdrawn, and clear() already emptied payloadHashes, so a
          // resurrected item would also no longer be deduped.
          done(err as Error);
          logger.debug(
            `EventQueue: Discarding ${items.length} in-flight event(s) cleared mid-flush`
          );
        } else if ((err as SendError)?.retryable === false) {
          // The API rejected this payload itself, so the identical batch can
          // never succeed. Keeping it queued would re-post it every interval
          // forever, re-invoking callbacks and burning the user's battery and
          // data. Drop it, and release the hashes so equivalent events are not
          // blocked from being enqueued again later. The web SDK likewise does
          // not re-queue a failed batch.
          items.forEach((item) => this.payloadHashes.delete(item.hash));
          done(err as Error);
          logger.error(
            `Dropping ${items.length} event(s), permanently rejected by the API:`,
            err
          );
        } else {
          // Re-add items to the front of the queue for retry on next flush
          // Note: We intentionally keep hashes in payloadHashes to prevent duplicate
          // events from being enqueued while these items are pending retry.
          this.queue.unshift(...items);
          done(err as Error);
          logger.error("Error sending events, re-queued for retry:", err);
        }

        // Re-arm here rather than in each caller's catch, so EVERY entry point
        // is covered — the background AppState flush and a consumer's manual
        // flush() included. flush() clears the timer on entry, so without this
        // a failed background flush would re-queue its items and leave nothing
        // scheduled to retry them. No-ops when the queue is empty or closed.
        this.scheduleFlush();
        throw err;
      }
    } finally {
      resolveMutex!();
    }
  }

  /**
   * Abort a batch whose events were cleared while it sat in retry backoff.
   * Retries span seconds, so a consumer can opt out between attempts; posting
   * the next one would deliver events after consent was withdrawn.
   */
  private assertNotCleared(generation: number): void {
    if (this.generation !== generation) {
      const error: SendError = new Error(
        "EventQueue: batch cleared during retry backoff"
      );
      // Never re-queue: these events were explicitly discarded.
      error.retryable = false;
      throw error;
    }
  }

  /**
   * Send events with retry logic
   */
  private async sendWithRetry(
    data: IFormoEventFlushPayload[],
    generation: number,
    attempt = 0
  ): Promise<void> {
    try {
      const response = await fetch(this.apiHost, {
        method: "POST",
        headers: EVENTS_API_REQUEST_HEADER(this.writeKey),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const shouldRetry = this.shouldRetry(response.status);
        if (shouldRetry && attempt < this.retryCount) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise<void>((resolve) => setTimeout(() => resolve(), delay));
          this.assertNotCleared(generation);
          return this.sendWithRetry(data, generation, attempt + 1);
        }
        const error: SendError = new Error(
          `HTTP error! status: ${response.status}`
        );
        // A 4xx that is not 429 rejects this payload permanently — an invalid
        // write key or a malformed batch. Tag it so flush() drops the batch
        // instead of re-posting it on every interval for the process lifetime.
        error.retryable = shouldRetry;
        throw error;
      }
    } catch (error) {
      if (isNetworkError(error)) {
        if (attempt < this.retryCount) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`Network error, retrying in ${delay}ms...`);
          await new Promise<void>((resolve) => setTimeout(() => resolve(), delay));
          this.assertNotCleared(generation);
          return this.sendWithRetry(data, generation, attempt + 1);
        }
        // Connectivity comes back; keep these for a later attempt.
        (error as SendError).retryable = true;
      }
      throw error;
    }
  }

  /**
   * Check if error should be retried
   */
  private shouldRetry(status: number): boolean {
    // Retry on server errors (5xx), rate limiting (429) and request timeout
    // (408). 408 matters now that a non-retryable status drops the batch: a
    // proxy or server timing out a request is transient, and treating it as
    // permanent would silently lose those events.
    return (status >= 500 && status <= 599) || status === 429 || status === 408;
  }

  /**
   * Discard all pending events without sending them.
   * Used when the user opts out of tracking to prevent queued events
   * from being sent after consent is revoked.
   */
  public clear(): void {
    // Invalidate any batch already in flight so a later send failure cannot
    // unshift it back onto the queue we are emptying here.
    this.generation++;
    this.queue = [];
    this.payloadHashes.clear();

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    logger.debug("EventQueue: Cleared all pending events");
  }

  /**
   * Wait for an in-flight flush to settle, giving up after CLEANUP_FLUSH_WAIT.
   * Returns whether it settled. The timer is always cleared, so a prompt
   * settle does not leave one pending.
   */
  private async awaitInFlightFlush(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.flushMutex.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), CLEANUP_FLUSH_WAIT);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Clean up resources, flushing any pending events first
   */
  public async cleanup(): Promise<void> {
    // Stop anything from arming a new timer for the rest of teardown.
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Detach up front rather than at the end: while the drain loop below is
    // awaiting a send, a backgrounding app would otherwise queue a flush that
    // outlives cleanup(). The closed check in the handler covers the same
    // window; removing the listener means the event never reaches it at all.
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    // A flush may already be in flight with its items spliced out of the
    // queue, which would make the drain loop below see an empty queue and
    // return before delivery finished. Wait for it to settle first — on a
    // transient failure it puts those items back, and the loop then retries
    // them.
    //
    // Bounded, because the mutex only resolves once the send settles and
    // `fetch` here has no request timeout: a stalled connection would
    // otherwise hang cleanup() forever, and FormoAnalyticsProvider awaits the
    // pending cleanup before building a replacement instance, so the SDK could
    // never be reconfigured again.
    const settled = await this.awaitInFlightFlush();

    if (!settled) {
      // The drain loop cannot help here: flush() awaits the same stalled
      // mutex, so it would hang exactly as this wait just did. Give up the
      // queued events rather than the teardown.
      logger.warn(
        `EventQueue: In-flight flush did not settle within ${millisecondsToSecond(
          CLEANUP_FLUSH_WAIT
        )}s, abandoning ${this.queue.length} event(s)`
      );
      this.queue = [];
      this.payloadHashes.clear();
      return;
    }

    // Flush all remaining queued events before teardown
    // Loop until queue is empty since flush() only sends flushAt events per call
    // Safety limit prevents infinite loops if flush silently fails
    const maxAttempts = Math.ceil(this.queue.length / this.flushAt) + 3;
    let attempts = 0;
    const initialQueueLength = this.queue.length;

    while (this.queue.length > 0 && attempts < maxAttempts) {
      const queueLengthBefore = this.queue.length;
      try {
        await this.flush();
      } catch (error) {
        logger.error("EventQueue: Failed to flush during cleanup", error);
        // Break on error to avoid infinite loop if flush keeps failing
        break;
      }

      // If queue length didn't decrease, flush is silently failing
      if (this.queue.length >= queueLengthBefore) {
        logger.warn("EventQueue: Flush did not reduce queue size, aborting cleanup");
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts && this.queue.length > 0) {
      logger.warn(
        `EventQueue: Cleanup safety limit reached. Discarding ${this.queue.length} events.`
      );
      this.queue = [];
      this.payloadHashes.clear();
    }

    if (initialQueueLength > 0) {
      logger.debug(`EventQueue: Cleanup completed, flushed ${initialQueueLength - this.queue.length} events`);
    }

    // The AppState listener was already detached at the top of cleanup, and
    // `closed` stops anything arming a timer, so nothing can have been
    // scheduled since. This is the last-resort clear for a timer that a flush
    // in the drain loop above might have left behind.
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
