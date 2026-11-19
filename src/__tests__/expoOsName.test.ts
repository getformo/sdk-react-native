import { Platform } from "react-native";
import {
  EventFactory,
  platformOsVersion,
  resolveExpoOsName,
} from "../lib/event/EventFactory";
import { initStorageManager } from "../lib/storage";

/**
 * In the Expo device-info path (no react-native-device-info), `os_name` came
 * from expo-device's `osName`. On Android that is `Build.VERSION.BASE_OS` when
 * non-empty, which on many devices is a build fingerprint and not "Android".
 * The fingerprint went out as `os_name` and the synthesized user agent was
 * empty, so the pipeline (which classifies device and OS from the user agent
 * alone) filed the device as unknown.
 */
const FINGERPRINT =
  "google/panther/panther:14/UQ1A.240205.002/11224170:user/release-keys";

const platform = Platform as unknown as {
  OS: string;
  Version: unknown;
  constants?: unknown;
};
const original = { ...platform };

afterEach(() => {
  platform.OS = original.OS;
  platform.Version = original.Version;
  platform.constants = original.constants;
});

describe("resolveExpoOsName", () => {
  it("reports android from Platform.OS when Expo returns a build fingerprint", () => {
    platform.OS = "android";
    expect(resolveExpoOsName(FINGERPRINT)).toBe("android");
  });

  it("reports ios from Platform.OS, the same as the device-info path", () => {
    platform.OS = "ios";
    expect(resolveExpoOsName("iPadOS")).toBe("ios");
    expect(resolveExpoOsName(undefined)).toBe("ios");
  });

  it("keeps Expo's value off native, where Platform.OS is only 'web'", () => {
    platform.OS = "web";
    expect(resolveExpoOsName("Mac OS")).toBe("Mac OS");
    expect(resolveExpoOsName(null)).toBe("web");
  });
});

describe("platformOsVersion", () => {
  it("uses the Android release, not the API level", () => {
    platform.OS = "android";
    platform.Version = 34;
    platform.constants = { Release: "14" };
    expect(platformOsVersion()).toBe("14");
  });

  it("falls back to Platform.Version when the release is missing", () => {
    platform.OS = "android";
    platform.Version = 34;
    platform.constants = undefined;
    expect(platformOsVersion()).toBe("34");
  });

  it("uses Platform.Version on iOS", () => {
    platform.OS = "ios";
    platform.Version = "17.4";
    platform.constants = { Release: "ignored" };
    expect(platformOsVersion()).toBe("17.4");
  });
});

describe("Expo device context", () => {
  // jest.setup.js gives react-native-device-info no default export, so the
  // factory takes the Expo path here, as in an Expo app without that module.
  const expoDevice = jest.requireMock("expo-device") as Record<string, unknown>;
  const originalDevice = { ...expoDevice };

  beforeEach(() => initStorageManager("expo-os-name-test"));
  afterEach(() => Object.assign(expoDevice, originalDevice));

  it("identifies Android and sends a user agent when osName is a fingerprint", async () => {
    platform.OS = "android";
    Object.assign(expoDevice, {
      osName: FINGERPRINT,
      osVersion: "14",
      modelName: "Pixel 7",
    });

    const event = await new EventFactory().generateScreenEvent("Home");

    expect(event.context?.os_name).toBe("android");
    expect(event.context?.os_version).toBe("14");
    expect(event.context?.user_agent).toBe(
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile FormoAnalytics/ReactNative",
    );
    expect(JSON.stringify(event.context)).not.toContain("panther");
  });

  it("still identifies iOS with a user agent", async () => {
    platform.OS = "ios";

    const event = await new EventFactory().generateScreenEvent("Home");

    expect(event.context?.os_name).toBe("ios");
    // The exact synthesized string: proves the Expo path produced it.
    expect(event.context?.user_agent).toBe(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FormoAnalytics/ReactNative",
    );
  });
});
