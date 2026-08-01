import { EventFactory, buildScreenUrl } from "../lib/event/EventFactory";
import { initStorageManager } from "../lib/storage";

/**
 * Mobile screen views are emitted as type="page" with
 * page_url = `app://<bundle id>/<screen>`.
 *
 * The shape is the point: it is a well-formed URL, so the bundle id sits in the
 * authority slot and the screen in the path — exactly like `https://<host>/<path>`
 * on web. A standard URL parser therefore yields origin and page_path directly,
 * with no mobile-specific reconstruction downstream.
 *
 * The previous form, `app://<screen>`, was malformed: the screen name occupied
 * the authority and there was no path at all, so parsers returned an empty path
 * and the pipeline had to rebuild both fields by hand.
 *
 * jest.setup mocks react-native-device-info with getBundleId() -> "com.test.app".
 */
describe("buildScreenUrl", () => {
  it("puts the bundle id in the authority and the screen in the path", () => {
    expect(buildScreenUrl("com.acme.wallet", "Home")).toBe(
      "app://com.acme.wallet/Home",
    );
  });

  it("does not double the separator for router-style names", () => {
    expect(buildScreenUrl("com.acme.wallet", "/tabs/leaderboard")).toBe(
      "app://com.acme.wallet/tabs/leaderboard",
    );
    expect(buildScreenUrl("com.acme.wallet", "///deep")).toBe(
      "app://com.acme.wallet/deep",
    );
  });

  it("preserves nested screen paths", () => {
    expect(buildScreenUrl("com.acme.wallet", "tabs/leaderboard")).toBe(
      "app://com.acme.wallet/tabs/leaderboard",
    );
  });

  it("omits the authority when there is no bundle id, keeping the path parseable", () => {
    // app:///Home still yields path "/Home"; the pipeline resolves origin from
    // context in this case rather than from the URL.
    expect(buildScreenUrl("", "Home")).toBe("app:///Home");
  });

  it("handles an empty screen name as the app root", () => {
    expect(buildScreenUrl("com.acme.wallet", "")).toBe("app://com.acme.wallet/");
  });
});

describe("generateScreenEvent page_url", () => {
  beforeEach(() => initStorageManager("screen-test-key"));

  it("emits app://<bundle id>/<screen>", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("Home");
    expect(evt.context?.page_url).toBe("app://com.test.app/Home");
    expect(evt.context?.page_title).toBe("Home");
  });

  it("normalises router-style paths into the URL path", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("/tabs/leaderboard");
    expect(evt.context?.page_url).toBe("app://com.test.app/tabs/leaderboard");
  });

  it("keeps the screen name out of the authority", async () => {
    // The regression the well-formed shape exists to prevent: with the screen
    // in the authority slot, URL parsers report an empty path.
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("Wallet");
    expect(evt.context?.page_url).not.toBe("app://Wallet");
    expect(String(evt.context?.page_url)).toContain("/Wallet");
  });

  it("keeps user-supplied context (spread last)", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("Home", undefined, undefined, {
      page_url: "app://Custom",
    });
    expect(evt.context?.page_url).toBe("app://Custom");
  });

  it("resolves device info once across repeated screen events", async () => {
    // getDeviceInfo() is memoised because it crosses the native bridge and its
    // values are static. Screen events now depend on it for the bundle id, and
    // generateContext needs it for every event too — without the memo each
    // screen view would cost two round-trips instead of zero.
    const factory = new EventFactory();
    const resolve = jest.spyOn(
      factory as unknown as { resolveDeviceInfo: () => Promise<unknown> },
      "resolveDeviceInfo",
    );

    await factory.generateScreenEvent("Home");
    await factory.generateScreenEvent("Wallet");
    await factory.generateScreenEvent("Settings");

    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe("generateScreenEvent bundle id resolution", () => {
  beforeEach(() => initStorageManager("screen-bundle-key"));

  it("prefers an explicitly configured options.app.bundleId", async () => {
    // generateContext lets options.app.bundleId override the native modules, so
    // the URL has to use the same precedence. Reading device info alone would
    // ignore the configuration — and on React Native Web nothing else resolves a
    // bundle id, so every screen URL would lose its authority.
    const factory = new EventFactory({ app: { bundleId: "com.configured.app" } });
    const evt = await factory.generateScreenEvent("Wallet");

    expect(evt.context?.page_url).toBe("app://com.configured.app/Wallet");
    // The URL authority and the context field must not disagree.
    expect(evt.context?.app_bundle_id).toBe("com.configured.app");
  });

  it("falls back to the detected bundle id when none is configured", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("Wallet");

    expect(evt.context?.page_url).toBe(
      `app://${evt.context?.app_bundle_id}/Wallet`,
    );
  });
});
