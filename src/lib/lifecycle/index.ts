/**
 * Application Lifecycle Event Manager
 *
 * Tracks application lifecycle events following the Segment/RudderStack spec:
 * - Application Installed (first launch)
 * - Application Updated (version/build changed)
 * - Application Opened (every cold start + foreground return)
 * - Application Backgrounded (app goes to background)
 *
 * Detection is JS-side using AsyncStorage (no native modules required).
 */

import { AppState, AppStateStatus, Linking } from "react-native";
import { logger } from "../logger";
import { storage, getStorageManager } from "../storage";
import {
  LOCAL_APP_VERSION_KEY,
  LOCAL_APP_BUILD_KEY,
} from "../../constants/storage";

/** Interface for the analytics instance to avoid circular deps */
interface IAnalyticsInstance {
  track(event: string, properties?: Record<string, unknown>): Promise<void>;
}

/** App version info resolved from device or config */
interface AppVersionInfo {
  version: string;
  build: string;
}

/**
 * Resolves current app version and build from device info modules or options.
 * Uses the same fallback chain as EventFactory.getDeviceInfo().
 */
async function resolveAppVersionInfo(
  appOptions?: { version?: string; build?: string }
): Promise<AppVersionInfo> {
  // Use explicit options first
  if (appOptions?.version && appOptions?.build) {
    return { version: appOptions.version, build: appOptions.build };
  }

  // Try react-native-device-info
  try {
    const DeviceInfo = require("react-native-device-info").default;
    return {
      version: appOptions?.version || DeviceInfo.getVersion(),
      build: appOptions?.build || DeviceInfo.getBuildNumber(),
    };
  } catch {
    // Not available
  }

  // Try expo-application
  try {
    const ExpoApplication = require("expo-application");
    return {
      version: appOptions?.version || ExpoApplication.nativeApplicationVersion || "",
      build: appOptions?.build || ExpoApplication.nativeBuildVersion || "",
    };
  } catch {
    // Not available
  }

  return {
    version: appOptions?.version || "",
    build: appOptions?.build || "",
  };
}

export class AppLifecycleManager {
  private analytics: IAnalyticsInstance;
  private appStateSubscription: { remove: () => void } | null = null;
  private lastAppState: AppStateStatus = AppState.currentState;
  private appVersionInfo: AppVersionInfo = { version: "", build: "" };

  constructor(analytics: IAnalyticsInstance) {
    this.analytics = analytics;
  }

  /**
   * Initialize lifecycle tracking.
   * Detects install/update, fires Application Opened, and sets up AppState listener.
   */
  async start(
    appOptions?: { version?: string; build?: string }
  ): Promise<void> {
    this.appVersionInfo = await resolveAppVersionInfo(appOptions);

    // Detect install vs update
    await this.detectInstallOrUpdate();

    // Fire Application Opened (cold start)
    let initialUrl: string | undefined;
    try {
      const url = await Linking.getInitialURL();
      if (url) {
        initialUrl = url;
      }
    } catch {
      // Linking not available
    }

    await this.analytics.track("Application Opened", {
      version: this.appVersionInfo.version,
      build: this.appVersionInfo.build,
      from_background: false,
      ...(initialUrl && { url: initialUrl }),
    });

    // Subscribe to AppState changes
    this.appStateSubscription = AppState.addEventListener(
      "change",
      this.handleAppStateChange.bind(this)
    );

    logger.info("AppLifecycleManager: Started");
  }

  /**
   * Compare stored version/build with current to detect install or update.
   * Requires persistent storage (AsyncStorage) — skips if only MemoryStorage is available,
   * since MemoryStorage is empty on every cold start and would false-positive as "installed".
   */
  private async detectInstallOrUpdate(): Promise<void> {
    const manager = getStorageManager();
    const hasPersistentStorage = manager?.hasPersistentStorage() ?? false;

    if (!hasPersistentStorage) {
      logger.warn(
        "AppLifecycleManager: AsyncStorage not available, skipping install/update detection. " +
          "Provide asyncStorage to FormoAnalyticsProvider for accurate lifecycle tracking."
      );
      return;
    }

    const previousVersion = storage().get(LOCAL_APP_VERSION_KEY) as string | null;
    const previousBuild = storage().get(LOCAL_APP_BUILD_KEY) as string | null;

    const { version, build } = this.appVersionInfo;

    if (previousVersion === null && previousBuild === null) {
      // No stored version — first install
      logger.info("AppLifecycleManager: Application Installed");
      await this.analytics.track("Application Installed", {
        version,
        build,
      });
    } else if (previousVersion !== version || previousBuild !== build) {
      // Version or build changed — update
      logger.info("AppLifecycleManager: Application Updated");
      await this.analytics.track("Application Updated", {
        version,
        build,
        previous_version: previousVersion || "",
        previous_build: previousBuild || "",
      });
    }

    // Persist current version/build for next comparison
    // Use setAsync to ensure data is written to AsyncStorage before continuing,
    // preventing duplicate install events if the app is terminated before persistence completes
    await storage().setAsync(LOCAL_APP_VERSION_KEY, version);
    await storage().setAsync(LOCAL_APP_BUILD_KEY, build);
  }

  /**
   * Handle AppState transitions for foreground/background events.
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    // Ignore "inactive" (iOS transitional state) and "unknown"
    if (nextAppState === "inactive" || nextAppState === "unknown") {
      return;
    }

    if (nextAppState === "active" && this.lastAppState === "background") {
      // Returning from background
      this.analytics
        .track("Application Opened", {
          version: this.appVersionInfo.version,
          build: this.appVersionInfo.build,
          from_background: true,
        })
        .catch((error) => {
          logger.error("AppLifecycleManager: Error tracking Application Opened", error);
        });
    }

    if (nextAppState === "background" && this.lastAppState === "active") {
      // Going to background
      this.analytics
        .track("Application Backgrounded", {
          version: this.appVersionInfo.version,
          build: this.appVersionInfo.build,
        })
        .catch((error) => {
          logger.error("AppLifecycleManager: Error tracking Application Backgrounded", error);
        });
    }

    this.lastAppState = nextAppState;
  }

  /**
   * Clean up AppState listener.
   */
  cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    logger.info("AppLifecycleManager: Cleaned up");
  }
}
