/**
 * Reproduces the exact environment the Expo tablet bug needed: `expo-application`
 * installed, `expo-device` NOT installed, and react-native-device-info
 * unavailable so getDeviceInfo() falls through to the Expo branch.
 *
 * In that configuration `ExpoDevice` is null, so `ExpoDevice?.deviceType` and
 * `ExpoDevice?.DeviceType?.TABLET` are both undefined and the original
 * `===` comparison was `undefined === undefined` — true. Every device reported
 * device_type: "tablet", which also flipped the synthesized user agent to an
 * iPad string, so both signals agreed on the wrong answer.
 *
 * This asserts on the built event context rather than on the helper, because the
 * helper being correct does not prove it is wired into the payload.
 */

// react-native-device-info absent → forces the Expo fallback branch.
jest.mock("react-native-device-info", () => {
  throw new Error("Cannot find module 'react-native-device-info'");
});

// expo-device absent → this is the condition that triggered the bug.
jest.mock("expo-device", () => {
  throw new Error("Cannot find module 'expo-device'");
});

// expo-application present → getDeviceInfo() still enters the Expo branch.
jest.mock(
  "expo-application",
  () => ({
    applicationName: "Formo Analytics Demo",
    nativeApplicationVersion: "1.1.0",
    nativeBuildVersion: "42",
    applicationId: "com.formo.analytics.demo",
  }),
  { virtual: true },
);

import { Linking } from "react-native";
import { FormoAnalytics } from "../FormoAnalytics";

describe("Expo device context without expo-device", () => {
  let sent: Array<Record<string, unknown>>;
  let instances: FormoAnalytics[];

  const makeStorage = () => {
    const data = new Map<string, string>();
    return {
      getItem: jest.fn(async (k: string) => data.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => void data.set(k, v)),
      removeItem: jest.fn(async (k: string) => void data.delete(k)),
      getAllKeys: jest.fn(async () => [...data.keys()]),
      multiGet: jest.fn(async (keys: string[]) =>
        keys.map((k) => [k, data.get(k) ?? null]),
      ),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sent = [];
    instances = [];
    (globalThis as { fetch?: unknown }).fetch = jest.fn(
      async (_url: string, init: { body: string }) => {
        sent.push(...JSON.parse(init.body));
        return { ok: true, status: 200, json: async () => ({}) };
      },
    );
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(null);
    (Linking.addEventListener as jest.Mock).mockReturnValue({ remove: jest.fn() });
  });

  afterEach(async () => {
    for (const instance of instances) await instance.cleanup();
  });

  const contextOfFirstEvent = async () => {
    const analytics = await FormoAnalytics.init(
      "wk_test",
      { flushAt: 1 },
      makeStorage() as never,
    );
    instances.push(analytics);
    await analytics.flush();
    return sent[0]!.context as Record<string, string>;
  };

  it("reports device_type mobile, not tablet", async () => {
    expect((await contextOfFirstEvent()).device_type).toBe("mobile");
  });

  it("does not synthesize an iPad user agent", async () => {
    const userAgent = String((await contextOfFirstEvent()).user_agent);
    expect(userAgent.toLowerCase()).not.toContain("ipad");
    expect(userAgent.toLowerCase()).toContain("iphone");
  });

  it("still resolves app identity from expo-application", async () => {
    // The app-context fields are what the Tinybird pipe uses as the native
    // signal and as the Pages origin, so losing them would hide mobile pages.
    expect(await contextOfFirstEvent()).toMatchObject({
      app_name: "Formo Analytics Demo",
      app_version: "1.1.0",
    });
  });
});
