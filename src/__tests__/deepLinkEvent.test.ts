import { Linking } from "react-native";
import { FormoAnalytics } from "../FormoAnalytics";

/**
 * `Deep Link Opened` (Segment spec) fires when the app is launched or resumed
 * via a deep link / universal link.
 *
 * Two things are load-bearing:
 *  - It must come AFTER `Application Opened` on a cold start. The link is read
 *    before lifecycle tracking starts (attribution has to be in storage before
 *    `Application Installed` fires), so emitting it where it is captured would
 *    invert the spec's order.
 *  - It is separate from `attribution.deeplinks`, which controls whether the
 *    link's UTM parameters are parsed into context. Turning the event off must
 *    not turn attribution off.
 */
describe("Deep Link Opened", () => {
  const getInitialURL = Linking.getInitialURL as jest.Mock;
  const addEventListener = Linking.addEventListener as jest.Mock;

  const trackedEvents: string[] = [];

  const instances: FormoAnalytics[] = [];

  const init = async (options?: {
    autocapture?: Record<string, boolean>;
    attribution?: Record<string, boolean>;
  }) => {
    trackedEvents.length = 0;
    const analytics = await FormoAnalytics.init("key", {
      ...options,
      // Lifecycle tracking is irrelevant here and would enqueue real events
      // into the event queue, whose flush timer then outlives the test run.
      autocapture: { lifecycle: false, ...options?.autocapture },
    });
    instances.push(analytics);
    // Record only — never call through. The real path reaches the event queue,
    // which would try to flush over an unmocked fetch and leave the run with
    // an open handle.
    jest.spyOn(analytics, "track").mockImplementation(async (event) => {
      trackedEvents.push(event);
    });
    return analytics;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getInitialURL.mockResolvedValue(null);
    addEventListener.mockReturnValue({ remove: jest.fn() });
  });

  afterEach(() => {
    instances.splice(0).forEach((instance) => instance.cleanup());
  });

  it("emits Deep Link Opened with the url for a runtime deep link", async () => {
    const analytics = await init();
    const handler = addEventListener.mock.calls.at(-1)?.[1];
    expect(handler).toBeDefined();

    await handler({ url: "myapp://product?utm_source=twitter" });

    expect(trackedEvents).toContain("Deep Link Opened");
    expect(analytics.track).toHaveBeenCalledWith("Deep Link Opened", {
      url: "myapp://product?utm_source=twitter",
    });
  });

  it("does not emit for a runtime link when deepLinks autocapture is off", async () => {
    const analytics = await init({ autocapture: { deepLinks: false } });
    const handler = addEventListener.mock.calls.at(-1)?.[1];

    await handler({ url: "myapp://product" });

    expect(trackedEvents).not.toContain("Deep Link Opened");
    // Attribution is a separate switch and must still have run.
    expect(analytics.setTrafficSourceFromUrl).toBeDefined();
  });

  it("ignores a url-less linking event", async () => {
    await init();
    const handler = addEventListener.mock.calls.at(-1)?.[1];

    await handler({});
    await handler(undefined);

    expect(trackedEvents).not.toContain("Deep Link Opened");
  });

  it("ignores runtime links while opted out", async () => {
    const analytics = await init();
    const handler = addEventListener.mock.calls.at(-1)?.[1];
    jest.spyOn(analytics, "hasOptedOutTracking").mockReturnValue(true);
    const attribution = jest.spyOn(analytics, "setTrafficSourceFromUrl");

    await handler({ url: "myapp://product?utm_source=twitter" });

    expect(attribution).not.toHaveBeenCalled();
    expect(trackedEvents).not.toContain("Deep Link Opened");
  });

  it("discards an initial link after consent changes", async () => {
    const analytics = await init();
    const attribution = jest.spyOn(analytics, "setTrafficSourceFromUrl");
    let release!: (url: string) => void;
    getInitialURL.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        release = resolve;
      })
    );

    const pending = (analytics as any).startDeepLinkCapture();
    analytics.optOutTracking();
    analytics.optInTracking();
    release("myapp://product?utm_source=twitter");
    await pending;

    expect(attribution).not.toHaveBeenCalled();
  });

  it("still emits the event when only attribution is disabled", async () => {
    // The two flags are independent: attribution.deeplinks parses UTMs into
    // context, autocapture.deepLinks emits the event. Turning attribution off
    // must not silently take the event with it — the Linking hook has to be
    // installed if EITHER consumer needs it.
    await init({ attribution: { deeplinks: false } });
    const handler = addEventListener.mock.calls.at(-1)?.[1];
    expect(handler).toBeDefined();

    await handler({ url: "myapp://product" });

    expect(trackedEvents).toContain("Deep Link Opened");
  });

  it("does not subscribe when BOTH deep-link flags are disabled", async () => {
    await init({
      attribution: { deeplinks: false },
      autocapture: { deepLinks: false },
    });

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
