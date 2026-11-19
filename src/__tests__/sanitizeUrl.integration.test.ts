import { AppState, Linking } from "react-native";
import { FormoAnalytics } from "../FormoAnalytics";

/**
 * `Options.sanitizeUrl` lets the app filter every URL the SDK stores or
 * reports.
 *
 * The case that motivated it: an OAuth provider returns to the app through a
 * deep link (`myapp://?privy_oauth_code=...&privy_oauth_state=...`). Without a
 * filter the SDK reported that URL in `Deep Link Opened` and `Application
 * Opened`, saved it as the referrer in place of the campaign referrer, and
 * attached it to the context of every later event.
 *
 * These drive the real stack down to `fetch` and assert on the JSON that would
 * leave the device, and on what is left in storage, because the requirement is
 * about what leaves the device and what persists, not about which internal
 * function was called.
 */
describe("sanitizeUrl on the wire", () => {
  const getInitialURL = Linking.getInitialURL as jest.Mock;
  const addLinkingListener = Linking.addEventListener as jest.Mock;
  const addAppStateListener = AppState.addEventListener as jest.Mock;

  const CAMPAIGN = "myapp://join?utm_source=twitter&utm_campaign=launch";
  const CALLBACK =
    "myapp-redirect://?privy_oauth_code=SECRETCODE&privy_oauth_state=SECRETSTATE";

  /** Drop OAuth callbacks entirely; pass everything else through. */
  const dropCallbacks = (url: string) =>
    url.includes("privy_oauth_code=") ? "" : url;

  let sent: Array<Record<string, any>>;
  let instances: FormoAnalytics[];

  const makeStorage = () => {
    const data = new Map<string, string>();
    return {
      data,
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
    getInitialURL.mockResolvedValue(null);
    addLinkingListener.mockReturnValue({ remove: jest.fn() });
    addAppStateListener.mockReturnValue({ remove: jest.fn() });
  });

  afterEach(async () => {
    for (const instance of instances) await instance.cleanup();
  });

  const start = async (
    options: Record<string, unknown> = {},
    asyncStorage = makeStorage(),
  ) => {
    const analytics = await FormoAnalytics.init(
      "wk_sanitize",
      { flushAt: 1, ...options },
      asyncStorage as never,
    );
    instances.push(analytics);
    await analytics.flush();
    return analytics;
  };

  const tick = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
  const names = () => sent.map((e) => e.event ?? `<${e.type}>`);
  const find = (event: string) => sent.find((e) => e.event === event);
  const openLink = async (url: string) => {
    addLinkingListener.mock.calls.at(-1)![1]({ url });
    await tick();
  };
  /** Everything that left the device plus everything persisted, as one string. */
  const everything = (asyncStorage: ReturnType<typeof makeStorage>) =>
    JSON.stringify(sent) + JSON.stringify([...asyncStorage.data.entries()]);

  it("keeps a warm OAuth callback out of events and storage, and keeps the campaign", async () => {
    const asyncStorage = makeStorage();
    const analytics = await start({ sanitizeUrl: dropCallbacks }, asyncStorage);

    await openLink(CAMPAIGN);
    sent.length = 0;
    await openLink(CALLBACK);

    // The dropped link is ignored: no event for it.
    expect(names()).not.toContain("Deep Link Opened");

    await analytics.track("after_sign_in");
    await analytics.flush();

    expect(find("after_sign_in")!.context).toMatchObject({
      utm_source: "twitter",
      utm_campaign: "launch",
      referrer: CAMPAIGN,
    });
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it("without any option, the built-in denylist still strips the OAuth values", async () => {
    const asyncStorage = makeStorage();
    const analytics = await start({}, asyncStorage);
    sent.length = 0;
    await openLink(CALLBACK);
    await analytics.track("later");
    await analytics.flush();

    // The link itself is still reported (only a sanitizeUrl hook can drop a
    // link); its secrets are not.
    expect(find("Deep Link Opened")!.properties.url).toBe("myapp-redirect://");
    expect(find("later")!.context.referrer).toBe("myapp-redirect://");
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it("counts a cold launch through the callback, with the URL omitted", async () => {
    const asyncStorage = makeStorage();
    getInitialURL.mockResolvedValue(CALLBACK);

    await start({ sanitizeUrl: dropCallbacks }, asyncStorage);

    const opened = find("Application Opened");
    expect(opened).toBeDefined();
    expect(opened!.properties).not.toHaveProperty("url");
    expect(names()).not.toContain("Deep Link Opened");
    expect(opened!.context).not.toHaveProperty("referrer");
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it("uses a rewritten URL for attribution, the referrer and the events", async () => {
    // Remove selected parameters from an otherwise useful link.
    const stripToken = (url: string) => url.replace(/([?&])token=[^&]*&?/, "$1");
    const asyncStorage = makeStorage();
    getInitialURL.mockResolvedValue("myapp://join?token=SECRETTOKEN&utm_source=email");

    const analytics = await start({ sanitizeUrl: stripToken }, asyncStorage);

    const clean = "myapp://join?utm_source=email";
    expect(find("Application Opened")!.properties.url).toBe(clean);
    expect(find("Deep Link Opened")!.properties.url).toBe(clean);

    sent.length = 0;
    await analytics.track("later");
    await analytics.flush();
    expect(find("later")!.context).toMatchObject({
      utm_source: "email",
      referrer: clean,
    });
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it("filters a referrer that an earlier SDK version saved", async () => {
    const asyncStorage = makeStorage();
    // What 1.3.3 left on the device: the raw callback saved as the referrer
    // next to the campaign's utm_source.
    asyncStorage.data.set(
      "formo_rn_wk_sanitize_traffic_source",
      JSON.stringify({ utm_source: "twitter", referrer: CALLBACK }),
    );

    // Upgrade: same storage, hook configured.
    const after = await start({ sanitizeUrl: dropCallbacks }, asyncStorage);
    sent.length = 0;
    await after.track("after_upgrade");
    await after.flush();

    const context = find("after_upgrade")!.context;
    expect(context).not.toHaveProperty("referrer");
    expect(context).toMatchObject({ utm_source: "twitter" });
    // Gone from the device too, not only from the events.
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it("filters an unfiltered saved referrer out of Application Installed", async () => {
    // The install event copies the saved referrer into its properties. Here
    // the saved value is raw (written with no hook), and the storage rewrite
    // at init is made to fail, so only the filter at the install event itself
    // stands between the raw value and the wire.
    const asyncStorage = makeStorage();
    const before = await start({ autocapture: { lifecycle: false } }, asyncStorage);
    await openLink("myapp://join?token=SECRETTOKEN&utm_source=email");
    await before.cleanup();
    instances = [];
    sent.length = 0;

    const rewrite = jest
      .spyOn(FormoAnalytics.prototype as any, "sanitizeStoredReferrer")
      .mockImplementation(() => {});
    const stripToken = (url: string) => url.replace(/([?&])token=[^&]*&?/, "$1");
    await start({ sanitizeUrl: stripToken }, asyncStorage);
    rewrite.mockRestore();

    expect(find("Application Installed")!.properties).toMatchObject({
      utm_source: "email",
      referrer: "myapp://join?utm_source=email",
    });
    expect(JSON.stringify(sent)).not.toContain("SECRET");
  });

  it("filters the saved referrer copied into Application Installed", async () => {
    // Attribution is captured before lifecycle starts, so a first launch
    // through a link copies the saved referrer into the install event.
    const stripToken = (url: string) => url.replace(/([?&])token=[^&]*&?/, "$1");
    getInitialURL.mockResolvedValue("myapp://join?token=SECRETTOKEN&utm_source=email");

    await start({ sanitizeUrl: stripToken });

    const installed = find("Application Installed");
    expect(installed!.properties).toMatchObject({
      utm_source: "email",
      referrer: "myapp://join?utm_source=email",
    });
    expect(JSON.stringify(sent)).not.toContain("SECRET");
  });

  it("filters the url property of an event the app tracks itself", async () => {
    const analytics = await start({ sanitizeUrl: dropCallbacks });
    sent.length = 0;

    await analytics.track("link_seen", { url: CALLBACK, kept: "yes" });
    await analytics.track("link_seen_2", { url: CAMPAIGN });
    await analytics.flush();

    expect(find("link_seen")!.properties).toEqual({ kept: "yes" });
    expect(find("link_seen_2")!.properties.url).toBe(CAMPAIGN);
  });

  it("an upgrade with no hook strips the saved referrer in storage", async () => {
    const asyncStorage = makeStorage();
    asyncStorage.data.set(
      "formo_rn_wk_sanitize_traffic_source",
      JSON.stringify({ utm_source: "twitter", referrer: CALLBACK }),
    );

    const analytics = await start({}, asyncStorage);
    sent.length = 0;
    await analytics.track("after_upgrade");
    await analytics.flush();

    expect(find("after_upgrade")!.context).toMatchObject({
      utm_source: "twitter",
      referrer: "myapp-redirect://",
    });
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it("strips tracking.excludeQueryParams everywhere, case-insensitively", async () => {
    const asyncStorage = makeStorage();
    getInitialURL.mockResolvedValue(
      "myapp://join?Token=SECRETTOKEN&utm_source=email&email=SECRET%40x.io#frag",
    );

    const analytics = await start(
      { tracking: { excludeQueryParams: ["token", "EMAIL"] } },
      asyncStorage,
    );
    await analytics.track("custom", { url: "https://x.io/p?a=1&token=SECRET2" });
    await analytics.flush();

    const clean = "myapp://join?utm_source=email#frag";
    expect(find("Application Opened")!.properties.url).toBe(clean);
    expect(find("Deep Link Opened")!.properties.url).toBe(clean);
    expect(find("Application Installed")!.properties.referrer).toBe(clean);
    expect(find("custom")!.properties.url).toBe("https://x.io/p?a=1");
    expect(find("custom")!.context).toMatchObject({
      utm_source: "email",
      referrer: clean,
    });
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it("does not read attribution from an excluded parameter", async () => {
    getInitialURL.mockResolvedValue("myapp://join?ref=SECRETREF&utm_source=email");

    await start({ tracking: { excludeQueryParams: ["ref"] } });

    const context = find("Application Opened")!.context;
    expect(context.utm_source).toBe("email");
    expect(context).not.toHaveProperty("ref");
    expect(JSON.stringify(sent)).not.toContain("SECRET");
  });

  it("the denylist holds even when the hook returns the parameter", async () => {
    const asyncStorage = makeStorage();
    const analytics = await start(
      { sanitizeUrl: () => "myapp://x?privy_oauth_code=SECRETCODE&keep=1" },
      asyncStorage,
    );
    sent.length = 0;
    await openLink("myapp://anything");
    await analytics.flush();

    expect(find("Deep Link Opened")!.properties.url).toBe("myapp://x?keep=1");
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it("applies to the public setTrafficSourceFromUrl", async () => {
    const asyncStorage = makeStorage();
    const analytics = await start({ sanitizeUrl: dropCallbacks }, asyncStorage);

    analytics.setTrafficSourceFromUrl(CAMPAIGN);
    analytics.setTrafficSourceFromUrl(CALLBACK);
    sent.length = 0;
    await analytics.track("later");
    await analytics.flush();

    expect(find("later")!.context.referrer).toBe(CAMPAIGN);
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });

  it.each([
    ["throws", () => { throw new Error("boom"); }],
    ["returns a non-string", () => undefined as unknown as string],
  ])("fails closed when the hook %s", async (_label, sanitizeUrl) => {
    const asyncStorage = makeStorage();
    getInitialURL.mockResolvedValue(CALLBACK);

    const analytics = await start({ sanitizeUrl }, asyncStorage);
    await openLink(CALLBACK);
    await analytics.track("still_tracked", { url: CALLBACK });
    await analytics.flush();

    // The SDK keeps working; only the URLs are dropped.
    expect(names()).toEqual(
      expect.arrayContaining(["Application Opened", "still_tracked"]),
    );
    expect(names()).not.toContain("Deep Link Opened");
    expect(everything(asyncStorage)).not.toContain("SECRET");
  });
});
