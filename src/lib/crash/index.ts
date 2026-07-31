/**
 * JavaScript crash reporting.
 *
 * Emits the Segment-spec `Application Crashed` event for unhandled JS errors by
 * wrapping React Native's global error handler.
 *
 * Scope: JavaScript errors only. A native crash (a Swift/Kotlin exception, an
 * OOM kill, a watchdog termination) never reaches the JS runtime, so it cannot
 * be observed from here — that needs a native crash reporter.
 */

import { LIFECYCLE_EVENT } from "../../constants/events";
import { logger } from "../logger";

/** RN's global handler signature. */
type ErrorHandler = (error: Error, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler?: () => ErrorHandler | undefined;
  setGlobalHandler?: (handler: ErrorHandler) => void;
}

/** Interface for the analytics instance to avoid circular deps */
interface IAnalyticsInstance {
  track(event: string, properties?: Record<string, unknown>): Promise<void>;
  flush(): Promise<void>;
}

/** Stack traces can be long; cap them so one crash can't dominate a batch. */
const MAX_STACK_LENGTH = 4000;

function getErrorUtils(): ErrorUtilsLike | undefined {
  // ErrorUtils is a React Native global, not an importable module. It is absent
  // under plain Node (unit tests, SSR), hence the guarded lookup.
  return (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
}

export class CrashReporter {
  private analytics: IAnalyticsInstance;
  private previousHandler: ErrorHandler | undefined;
  private installedHandler: ErrorHandler | undefined;
  private started = false;

  constructor(analytics: IAnalyticsInstance) {
    this.analytics = analytics;
  }

  /**
   * Install the global error handler.
   *
   * The previous handler is always called afterwards — React Native's default
   * handler is what shows the redbox in dev and terminates the app on a fatal
   * error in production, and a customer's crash reporter (Sentry, Bugsnag) may
   * also be in the chain. Swallowing it would break both.
   */
  start(): void {
    if (this.started) return;

    const errorUtils = getErrorUtils();
    if (!errorUtils?.setGlobalHandler || !errorUtils?.getGlobalHandler) {
      logger.debug(
        "CrashReporter: ErrorUtils unavailable, skipping crash tracking",
      );
      return;
    }

    this.previousHandler = errorUtils.getGlobalHandler();

    const handler: ErrorHandler = (error, isFatal) => {
      // Nothing in here may throw: this runs while the app is already failing,
      // and an exception would replace the real crash with ours.
      try {
        this.report(error, isFatal);
      } catch (reportingError) {
        logger.debug("CrashReporter: failed to report crash", reportingError);
      }

      this.previousHandler?.(error, isFatal);
    };

    this.installedHandler = handler;
    errorUtils.setGlobalHandler(handler);
    this.started = true;
    logger.info("CrashReporter: Started");
  }

  private report(error: Error, isFatal?: boolean): void {
    const stack = typeof error?.stack === "string" ? error.stack : "";

    // Fire and forget. On a fatal error the process is about to die, so the
    // flush is a best effort — the queue also flushes on background and on the
    // next launch's retry, which is where most fatal crashes are actually
    // recovered from.
    void this.analytics
      .track(LIFECYCLE_EVENT.APPLICATION_CRASHED, {
        message: error?.message ?? String(error),
        name: error?.name ?? "Error",
        stack: stack.slice(0, MAX_STACK_LENGTH),
        stack_truncated: stack.length > MAX_STACK_LENGTH,
        fatal: Boolean(isFatal),
      })
      .then(() => this.analytics.flush())
      .catch((trackError) => {
        logger.debug("CrashReporter: failed to send crash event", trackError);
      });
  }

  /**
   * Restore the previous handler.
   *
   * Only restores if ours is still the installed handler — if something else
   * wrapped us afterwards, replacing the chain would unhook that too.
   */
  cleanup(): void {
    if (!this.started) return;

    const errorUtils = getErrorUtils();
    if (
      errorUtils?.getGlobalHandler?.() === this.installedHandler &&
      errorUtils?.setGlobalHandler &&
      this.previousHandler
    ) {
      errorUtils.setGlobalHandler(this.previousHandler);
    }

    this.started = false;
    this.installedHandler = undefined;
    this.previousHandler = undefined;
    logger.info("CrashReporter: Cleaned up");
  }
}
