import { AppState, AppStateStatus } from "react-native";
import { Options } from "../../types";
import {
  LIFECYCLE_APP_VERSION_KEY,
  LIFECYCLE_APP_BUILD_KEY,
} from "../../constants";
import { storage } from "../storage";
import { logger } from "../logger";

// Lazy load device info modules (same pattern as EventFactory)
let DeviceInfo: typeof import("react-native-device-info").default | null = null;
let ExpoApplication: typeof import("expo-application") | null = null;

try {
  DeviceInfo = require("react-native-device-info").default;
} catch {
  // Not available
}

try {
  ExpoApplication = require("expo-application");
} catch {
  // Not available
}

export type TrackFunction = (
  event: string,
  properties?: Record<string, unknown>
) => Promise<void>;

/**
 * Tracks mobile application lifecycle events:
 * - Application Installed (first launch after install)
 * - Application Updated (first launch after version change)
 * - Application Opened (every foreground transition)
 * - Application Backgrounded (every background transition)
 */
export class LifecycleEventTracker {
  private trackFn: TrackFunction;
  private options?: Options;
  private appStateSubscription: { remove: () => void } | null = null;
  private currentAppState: AppStateStatus;
  private started = false;

  constructor(trackFn: TrackFunction, options?: Options) {
    this.trackFn = trackFn;
    this.options = options;
    this.currentAppState = AppState.currentState;
  }

  /**
   * Start lifecycle tracking.
   * Checks for install/update, fires initial "Application Opened",
   * and begins listening for AppState changes.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    try {
      const { version, build } = this.getAppVersionInfo();

      const previousVersion = storage().get(LIFECYCLE_APP_VERSION_KEY) as
        | string
        | null;
      const previousBuild = storage().get(LIFECYCLE_APP_BUILD_KEY) as
        | string
        | null;

      if (!previousVersion) {
        // No stored version — this is a fresh install
        await this.trackFn("Application Installed", {
          version,
          build,
        });
        logger.info("Lifecycle: Application Installed");
      } else if (previousVersion !== version || previousBuild !== build) {
        // Version or build changed — this is an update
        await this.trackFn("Application Updated", {
          version,
          build,
          previous_version: previousVersion,
          previous_build: previousBuild || "",
        });
        logger.info(
          `Lifecycle: Application Updated (${previousVersion} -> ${version})`
        );
      }

      // Persist current version
      storage().set(LIFECYCLE_APP_VERSION_KEY, version);
      storage().set(LIFECYCLE_APP_BUILD_KEY, build);

      // Fire initial Application Opened (cold start)
      await this.trackFn("Application Opened", {
        version,
        build,
        from_background: false,
      });
      logger.info("Lifecycle: Application Opened (cold start)");

      // Listen for foreground/background transitions
      this.appStateSubscription = AppState.addEventListener(
        "change",
        this.handleAppStateChange.bind(this)
      );
    } catch (error) {
      logger.error("Lifecycle: Failed to start lifecycle tracking", error);
    }
  }

  /**
   * Handle AppState transitions to track opened/backgrounded events.
   */
  private async handleAppStateChange(
    nextAppState: AppStateStatus
  ): Promise<void> {
    try {
      const wasBackground =
        this.currentAppState === "background" ||
        this.currentAppState === "inactive";
      const isActive = nextAppState === "active";
      const isBackground = nextAppState === "background";

      if (wasBackground && isActive) {
        const { version, build } = this.getAppVersionInfo();
        await this.trackFn("Application Opened", {
          version,
          build,
          from_background: true,
        });
        logger.debug("Lifecycle: Application Opened (from background)");
      } else if (isBackground && this.currentAppState === "active") {
        await this.trackFn("Application Backgrounded", {});
        logger.debug("Lifecycle: Application Backgrounded");
      }

      this.currentAppState = nextAppState;
    } catch (error) {
      logger.error("Lifecycle: Error handling app state change", error);
    }
  }

  /**
   * Get app version and build from options or device info modules.
   */
  private getAppVersionInfo(): { version: string; build: string } {
    // Options override takes precedence
    if (this.options?.app?.version || this.options?.app?.build) {
      return {
        version: this.options.app.version || "",
        build: this.options.app.build || "",
      };
    }

    // Try react-native-device-info
    if (DeviceInfo) {
      try {
        return {
          version: DeviceInfo.getVersion(),
          build: DeviceInfo.getBuildNumber(),
        };
      } catch {
        // Fall through
      }
    }

    // Try expo-application
    if (ExpoApplication) {
      try {
        return {
          version: ExpoApplication.nativeApplicationVersion || "",
          build: ExpoApplication.nativeBuildVersion || "",
        };
      } catch {
        // Fall through
      }
    }

    // Fallback
    return { version: "", build: "" };
  }

  /**
   * Clean up AppState listener.
   */
  cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.started = false;
  }
}
