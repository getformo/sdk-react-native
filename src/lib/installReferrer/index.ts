/**
 * Install Referrer / attribution capture (Android)
 *
 * Populates the existing traffic source fields (utm_source, utm_medium,
 * utm_campaign, utm_term, utm_content, ref, referrer) from the Google Play
 * Install Referrer on first launch. This is what enables web-to-mobile
 * attribution: a user who tapped a link on example.com before installing shows
 * up with that referrer on their first events (see P-2207).
 *
 * - Android: Google Play Install Referrer API via react-native-play-install-referrer
 *   (optional peer dep). Returns a URL-encoded query string like
 *   "utm_source=example.com&utm_campaign=spring_sale&..." which we parse with
 *   parseTrafficSource.
 *
 * - iOS: NOT supported. Apple exposes no install-referrer API, so an install
 *   cannot be attributed to a referring website from the SDK. Doing so requires
 *   a third-party attribution service (Branch/AppsFlyer) or fingerprint
 *   matching — out of scope. On iOS this capture is a no-op.
 *
 * The native module is lazy-required and capture silently no-ops when it is not
 * installed (keeps Expo Go and minimal integrations working).
 *
 * Result is merged with mergeTrafficSourceFill so a deep link that arrived
 * via Linking.getInitialURL() takes precedence over install-referrer data.
 *
 * The resolution is one-shot: on success we set LOCAL_INSTALL_REFERRER_RESOLVED_KEY
 * so we never call the native API again (Play returns meaningful data only on
 * the first fetch).
 */

import { Platform } from "react-native";
import { logger } from "../logger";
import { storage, getStorageManager } from "../storage";
import { LOCAL_INSTALL_REFERRER_RESOLVED_KEY } from "../../constants/storage";
import {
  parseTrafficSource,
  mergeTrafficSourceFill,
} from "../../utils/trafficSource";
import type { ITrafficSource } from "../../types";

// Lazy-load the optional native module. Absence is fine — attribution is best-effort.
let PlayInstallReferrer: {
  getInstallReferrerInfo: (
    cb: (info: { installReferrer?: string } | null, error?: unknown) => void
  ) => void;
} | null = null;

try {
  PlayInstallReferrer = require("react-native-play-install-referrer")
    .PlayInstallReferrer;
} catch {
  // Not installed — Android install referrer capture will no-op.
}

/**
 * Upper bound on the Play Install Referrer native call.
 *
 * SDK init awaits this capture so the referrer is available for the
 * Application Installed event, which means it must never block init
 * indefinitely (a stalled Play Store service connection can leave the callback
 * pending forever). Until init resolves the provider serves its no-op context,
 * so any delay here is a window where startup events are dropped.
 *
 * That cost is paid on the FIRST launch only: the capture is one-shot, and
 * every later launch short-circuits on LOCAL_INSTALL_REFERRER_RESOLVED_KEY
 * before reaching the native call. The bind is normally sub-second, so this is
 * kept tight rather than generous — on timeout we skip and retry next launch.
 */
const INSTALL_REFERRER_TIMEOUT_MS = 1500;

export interface CaptureOptions {
  customRefParams?: string[];
  pathPattern?: string;
  canCapture?: () => boolean;
}

/**
 * Capture install-time attribution and merge into the stored traffic source.
 * One-shot: returns immediately if already resolved on a previous launch.
 */
export async function captureInstallReferrer(
  options: CaptureOptions = {}
): Promise<void> {
  try {
    if (options.canCapture && !options.canCapture()) return;
    // The one-shot flag is only useful if it can persist across launches.
    // Without AsyncStorage (MemoryStorage fallback) the flag is lost every
    // restart, so we'd re-hit the native API every cold start. Mirror the
    // lifecycle manager's guard and skip capture entirely in that case.
    const hasPersistentStorage =
      getStorageManager()?.hasPersistentStorage() ?? false;
    if (!hasPersistentStorage) {
      logger.debug(
        "InstallReferrer: persistent storage unavailable, skipping capture"
      );
      return;
    }

    const resolved = storage().get(LOCAL_INSTALL_REFERRER_RESOLVED_KEY);
    if (resolved === "true") {
      logger.debug("InstallReferrer: already resolved, skipping");
      return;
    }

    let didResolve = false;

    if (Platform.OS === "android") {
      didResolve = await captureAndroidReferrer(options);
    } else {
      // iOS (and any non-Android platform): no OS-level install referrer exists.
      // Attributing an install to a referring website requires a third-party
      // attribution SDK (Branch/AppsFlyer) or fingerprint matching. No-op.
      logger.debug(
        `InstallReferrer: no install-referrer source on ${Platform.OS}, skipping`
      );
      return;
    }

    if (didResolve && (!options.canCapture || options.canCapture())) {
      await storage().setAsync(LOCAL_INSTALL_REFERRER_RESOLVED_KEY, "true");
    }
  } catch (error) {
    // Never let attribution failures break SDK init.
    logger.debug("InstallReferrer: capture failed", error);
  }
}

/**
 * Android: call Play Install Referrer API once, parse the returned UTM query
 * string, fill in any empty traffic-source fields.
 */
async function captureAndroidReferrer(
  options: CaptureOptions
): Promise<boolean> {
  if (!PlayInstallReferrer) {
    // Warn (not debug) on Android: attribution silently does nothing here, and
    // marking the peer optional suppresses the missing-peer install warning, so
    // this is the only actionable signal the integrator gets.
    logger.warn(
      "InstallReferrer: react-native-play-install-referrer is not installed — " +
        "Android install attribution is disabled. Install it and rebuild the " +
        "native app to enable web-to-mobile attribution."
    );
    return false;
  }

  // Distinguish "native API errored" (retry next launch) from "native API
  // succeeded but no referrer data" (organic install — mark resolved so we
  // don't re-call every launch).
  //
  // The native callback is bounded by a timeout: a stalled Play Store service
  // connection would otherwise leave this promise pending forever, and since
  // init() awaits this, that would hang SDK initialization and leave every
  // consumer on the no-op context. On timeout we resolve as "errored" so the
  // capture is retried on the next launch.
  const result = await new Promise<{
    ok: boolean;
    info: { installReferrer?: string } | null;
  }>((resolve) => {
    let settled = false;
    const finish = (value: {
      ok: boolean;
      info: { installReferrer?: string } | null;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      logger.debug(
        `InstallReferrer: Play API did not respond within ${INSTALL_REFERRER_TIMEOUT_MS}ms, continuing`
      );
      finish({ ok: false, info: null });
    }, INSTALL_REFERRER_TIMEOUT_MS);

    try {
      PlayInstallReferrer!.getInstallReferrerInfo((info, error) => {
        if (error) {
          logger.debug("InstallReferrer: Play API error", error);
          finish({ ok: false, info: null });
          return;
        }
        finish({ ok: true, info: info ?? null });
      });
    } catch (e) {
      logger.debug("InstallReferrer: Play API threw", e);
      finish({ ok: false, info: null });
    }
  });

  if (!result.ok) return false; // errored — retry next launch
  if (options.canCapture && !options.canCapture()) return false;

  const referrerQuery = result.info?.installReferrer;
  if (!referrerQuery) {
    // Organic install (or untracked). API answered definitively — mark
    // resolved so we don't ask Play again on every launch.
    logger.debug("InstallReferrer: no Play referrer (organic install)");
    return true;
  }

  // The referrer string is already URL-encoded UTM params, e.g.
  //   "utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=kw&utm_content=ad1"
  // Wrap in a dummy URL so parseTrafficSource can read it.
  const parsed = parseTrafficSource(
    `https://play.google.com/store/apps?${referrerQuery}`,
    options.customRefParams,
    options.pathPattern
  );

  // Don't let the dummy play.google.com URL overwrite a real referrer — clear
  // referrer if it's the synthetic one and no deep link was present.
  const toMerge: Partial<ITrafficSource> = { ...parsed };
  if (
    toMerge.referrer &&
    toMerge.referrer.startsWith("https://play.google.com/store/apps?")
  ) {
    // Preserve the raw referrer query as-is, useful for debugging campaigns
    // that use non-UTM keys.
    toMerge.referrer = referrerQuery;
  }

  mergeTrafficSourceFill(toMerge);
  logger.info("InstallReferrer: captured Android install referrer");
  return true;
}
