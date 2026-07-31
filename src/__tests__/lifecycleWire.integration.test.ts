import { AppState, Linking } from "react-native";
import { FormoAnalytics } from "../FormoAnalytics";

/**
 * End-to-end wire test for the lifecycle events.
 *
 * The unit tests around these features stub `analytics.track`, which proves the
 * decision logic but says nothing about whether an event actually reaches the
 * network with the right shape. This drives the real stack — FormoAnalytics →
 * EventFactory → EventManager → EventQueue → fetch — and asserts on the JSON
 * body that would leave the device.
 *
 * Everything below the SDK is real; only `fetch`, AsyncStorage and the React
 * Native surface (already stubbed in jest.setup.js) are substituted.
 */
describe("lifecycle events on the wire", () => {
  const getInitialURL = Linking.getInitialURL as jest.Mock;
  const addLinkingListener = Linking.addEventListener as jest.Mock;
  const addAppStateListener = AppState.addEventListener as jest.Mock;

  let sent: Array<Record<string, unknown>>;
  let fetchMock: jest.Mock;
  let instances: FormoAnalytics[];

  /** In-memory AsyncStorage so install/update detection behaves realistically. */
  const makeStorage = (seed: Record<string, string> = {}) => {
    const data = new Map(Object.entries(seed));
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

    fetchMock = jest.fn(async (_url: string, init: { body: string }) => {
      sent.push(...JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({}) };
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    getInitialURL.mockResolvedValue(null);
    addLinkingListener.mockReturnValue({ remove: jest.fn() });
    addAppStateListener.mockReturnValue({ remove: jest.fn() });
  });

  afterEach(async () => {
    for (const instance of instances) await instance.cleanup();
  });

  const start = async (
    options: Record<string, unknown> = {},
    seed?: Record<string, string>,
  ) => {
    const analytics = await FormoAnalytics.init(
      "wk_test",
      // flushAt: 1 sends each event immediately, so no test depends on a timer.
      { flushAt: 1, ...options },
      makeStorage(seed) as never,
    );
    instances.push(analytics);
    await analytics.flush();
    return analytics;
  };

  const names = () => sent.map((e) => e.event ?? `<${e.type}>`);
  const find = (event: string) => sent.find((e) => e.event === event);

  it("sends the cold-start lifecycle events with the documented envelope", async () => {
    await start();

    const opened = find("Application Opened");
    expect(opened).toBeDefined();
    expect(opened).toMatchObject({
      type: "track",
      channel: "mobile",
      properties: expect.objectContaining({ from_background: false }),
    });
    // Every event must carry the identity + dedup fields the pipeline keys on.
    expect(opened).toEqual(
      expect.objectContaining({
        anonymous_id: expect.any(String),
        session_id: expect.any(String),
        message_id: expect.any(String),
        original_timestamp: expect.any(String),
        sent_at: expect.any(String),
      }),
    );
    expect(names()).toContain("Application Installed");
  });

  it("sends Application Foregrounded only when enabled, with Application Opened", async () => {
    await start({ autocapture: { foregrounded: true } });
    const handler = addAppStateListener.mock.calls.at(-1)![1];

    sent.length = 0;
    handler("background");
    handler("active");
    await new Promise((r) => setTimeout(r, 0));

    expect(names()).toEqual([
      "Application Backgrounded",
      "Application Opened",
      "Application Foregrounded",
    ]);
    expect(find("Application Foregrounded")).toMatchObject({
      type: "track",
      channel: "mobile",
    });
  });

  it("omits Application Foregrounded by default", async () => {
    await start();
    const handler = addAppStateListener.mock.calls.at(-1)![1];

    sent.length = 0;
    handler("background");
    handler("active");
    await new Promise((r) => setTimeout(r, 0));

    expect(names()).toEqual(["Application Backgrounded", "Application Opened"]);
  });

  it("sends Deep Link Opened for the launch URL, ordered after Application Opened", async () => {
    getInitialURL.mockResolvedValue(
      "formo-demo://wallet?utm_source=twitter&utm_medium=social",
    );

    await start();

    const order = names();
    expect(order).toContain("Deep Link Opened");
    expect(order.indexOf("Deep Link Opened")).toBeGreaterThan(
      order.indexOf("Application Opened"),
    );
    expect(find("Deep Link Opened")).toMatchObject({
      properties: {
        url: "formo-demo://wallet?utm_source=twitter&utm_medium=social",
      },
    });
  });

  it("propagates deep-link UTMs into the context of every later event", async () => {
    getInitialURL.mockResolvedValue(
      "formo-demo://wallet?utm_source=twitter&utm_medium=social",
    );
    const analytics = await start();

    sent.length = 0;
    await analytics.track("custom_event");
    await analytics.flush();

    expect(sent[0]!.context).toMatchObject({
      utm_source: "twitter",
      utm_medium: "social",
    });
  });

  it("sends Deep Link Opened for a runtime link", async () => {
    await start();
    const handler = addLinkingListener.mock.calls.at(-1)![1];

    sent.length = 0;
    handler({ url: "formo-demo://settings?utm_source=email" });
    await new Promise((r) => setTimeout(r, 0));

    expect(find("Deep Link Opened")).toMatchObject({
      properties: { url: "formo-demo://settings?utm_source=email" },
    });
  });

  it("sends Application Crashed and still re-raises to the previous handler", async () => {
    const previous = jest.fn();
    const errorUtils = {
      getGlobalHandler: () => current,
      setGlobalHandler: (h: (e: Error, f?: boolean) => void) => {
        current = h;
      },
    };
    let current: ((e: Error, f?: boolean) => void) | undefined = previous;
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = errorUtils;

    await start({ autocapture: { crashes: true } });

    sent.length = 0;
    const boom = new TypeError("undefined is not a function");
    current!(boom, true);
    await new Promise((r) => setTimeout(r, 0));

    expect(find("Application Crashed")).toMatchObject({
      type: "track",
      channel: "mobile",
      properties: expect.objectContaining({
        message: "undefined is not a function",
        name: "TypeError",
        fatal: true,
      }),
    });
    expect(previous).toHaveBeenCalledWith(boom, true);

    delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
  });

  it("sends the push notification events under their exact spec names", async () => {
    const analytics = await start();

    sent.length = 0;
    await analytics.pushNotificationReceived({ campaign_id: "c1" });
    await analytics.pushNotificationTapped({ campaign_id: "c1" });
    await analytics.pushNotificationBounced({ campaign_id: "c1" });
    await analytics.flush();

    expect(names()).toEqual([
      "Push Notification Received",
      "Push Notification Tapped",
      "Push Notification Bounced",
    ]);
    expect(find("Push Notification Tapped")).toMatchObject({
      type: "track",
      channel: "mobile",
      properties: { campaign_id: "c1" },
    });
  });

  it("emits a screen view as type=page with an app:// url the pipeline can parse", async () => {
    const analytics = await start();

    sent.length = 0;
    await analytics.screen("Wallet");
    await analytics.flush();

    expect(sent[0]).toMatchObject({
      type: "page",
      channel: "mobile",
      context: expect.objectContaining({ page_url: "app://Wallet" }),
    });
  });

  it("reports device context that classifies as an iPhone, not a tablet", async () => {
    // The Tinybird pipe reads device_type / os_name / device_manufacturer to
    // bucket the event. jest.setup mocks react-native-device-info with
    // isTablet: false, so a regression in the Expo tablet guard or in the
    // device-info branch shows up here as device_type flipping to "tablet".
    await start();

    const context = find("Application Opened")!.context as Record<string, string>;
    expect(context).toMatchObject({
      device_type: "mobile",
      device_manufacturer: "Apple",
    });
    // os_name casing is platform-dependent — "ios" from Platform.OS, "iOS" or
    // "iPadOS" from expo-device, or an Android build fingerprint. The pipe
    // lowercases before comparing, so only the identity matters here.
    expect(context.os_name.toLowerCase()).toBe("ios");
  });
});
