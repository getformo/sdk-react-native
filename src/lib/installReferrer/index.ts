/**
 * Install Referrer / attribution capture
 *
 * Populates the existing traffic source fields (utm_source, utm_medium,
 * utm_campaign, utm_term, utm_content, ref, referrer) from platform install
 * attribution APIs on first launch:
 *
 * - Android: Google Play Install Referrer API via react-native-play-install-referrer
 *   (optional peer dep). Returns a URL-encoded query string like
 *   "utm_source=google&utm_campaign=spring_sale&..." which we parse with
 *   parseTrafficSource.
 *
 * - iOS: AdServices attribution via react-native-ad-services-attribution
 *   (optional peer dep). Returns an attribution token which we exchange with
 *   Apple's AdServices endpoint; the response is mapped onto utm_* fields.
 *
 * Both native modules are lazy-required and the capture silently no-ops when
 * they are not installed (keeps Expo Go and minimal integrations working).
 *
 * Result is merged with mergeTrafficSourceFill so a deep link that arrived
 * via Linking.getInitialURL() takes precedence over install-referrer data.
 *
 * The resolution is one-shot: on success we set LOCAL_INSTALL_REFERRER_RESOLVED_KEY
 * so we never call the native API again (Play returns meaningful data only on
 * the first fetch; Apple only within ~24h of install).
 */

import { Platform } from "react-native";
import { logger } from "../logger";
import { storage } from "../storage";
import { LOCAL_INSTALL_REFERRER_RESOLVED_KEY } from "../../constants/storage";
import {
  parseTrafficSource,
  mergeTrafficSourceFill,
} from "../../utils/trafficSource";
import type { ITrafficSource } from "../../types";

// Lazy-load optional native modules. Absence is fine — attribution is best-effort.
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

let AdServicesAttribution: {
  getAttributionToken: () => Promise<string | null>;
} | null = null;

try {
  const mod = require("react-native-ad-services-attribution");
  AdServicesAttribution = mod.default ?? mod;
} catch {
  // Not installed — iOS AdServices capture will no-op.
}

export interface CaptureOptions {
  customRefParams?: string[];
  pathPattern?: string;
}

/**
 * Capture install-time attribution and merge into the stored traffic source.
 * One-shot: returns immediately if already resolved on a previous launch.
 */
export async function captureInstallReferrer(
  options: CaptureOptions = {}
): Promise<void> {
  try {
    const resolved = storage().get(LOCAL_INSTALL_REFERRER_RESOLVED_KEY);
    if (resolved === "true") {
      logger.debug("InstallReferrer: already resolved, skipping");
      return;
    }

    let didResolve = false;

    if (Platform.OS === "android") {
      didResolve = await captureAndroidReferrer(options);
    } else if (Platform.OS === "ios") {
      didResolve = await captureIOSAttribution();
    } else {
      logger.debug(
        `InstallReferrer: unsupported platform ${Platform.OS}, skipping`
      );
      return;
    }

    if (didResolve) {
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
    logger.debug(
      "InstallReferrer: react-native-play-install-referrer not installed, skipping Android capture"
    );
    return false;
  }

  const info = await new Promise<{ installReferrer?: string } | null>(
    (resolve) => {
      try {
        PlayInstallReferrer!.getInstallReferrerInfo((result, error) => {
          if (error) {
            logger.debug("InstallReferrer: Play API error", error);
            resolve(null);
            return;
          }
          resolve(result);
        });
      } catch (e) {
        logger.debug("InstallReferrer: Play API threw", e);
        resolve(null);
      }
    }
  );

  const referrerQuery = info?.installReferrer;
  if (!referrerQuery) {
    return false;
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

/**
 * iOS: fetch AdServices attribution token and exchange it with Apple for
 * campaign metadata. Map campaignId/adGroupId/keywordId onto utm_* fields.
 * Falls back to no-op if the native module isn't present.
 */
async function captureIOSAttribution(): Promise<boolean> {
  if (!AdServicesAttribution) {
    logger.debug(
      "InstallReferrer: react-native-ad-services-attribution not installed, skipping iOS capture"
    );
    return false;
  }

  let token: string | null;
  try {
    token = await AdServicesAttribution.getAttributionToken();
  } catch (e) {
    logger.debug("InstallReferrer: failed to get AdServices token", e);
    return false;
  }
  if (!token) return false;

  let data: Record<string, unknown> | null = null;
  try {
    const response = await fetch("https://api-adservices.apple.com/api/v1/", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: token,
    });
    if (!response.ok) {
      logger.debug(
        `InstallReferrer: AdServices returned ${response.status}, skipping`
      );
      return false;
    }
    data = (await response.json()) as Record<string, unknown>;
  } catch (e) {
    logger.debug("InstallReferrer: AdServices exchange failed", e);
    return false;
  }

  if (!data || data.attribution === false) {
    // Organic install
    return true;
  }

  const toStr = (v: unknown): string | undefined =>
    v === undefined || v === null ? undefined : String(v);

  const attributed: Partial<ITrafficSource> = {
    utm_source: "apple_search_ads",
    utm_medium: "cpc",
    ...(toStr(data.campaignId) && { utm_campaign: toStr(data.campaignId)! }),
    ...(toStr(data.adGroupId) && { utm_content: toStr(data.adGroupId)! }),
    ...(toStr(data.keywordId) && { utm_term: toStr(data.keywordId)! }),
  };

  mergeTrafficSourceFill(attributed);
  logger.info("InstallReferrer: captured iOS AdServices attribution");
  return true;
}
