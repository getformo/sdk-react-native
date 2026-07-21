import { EventFactory } from "../lib/event/EventFactory";
import { initStorageManager } from "../lib/storage";

/**
 * Mobile screen views are emitted as type="page" with page_url `app://<name>`.
 * The ingestion pipeline (P-2070) owns the interpretation: it derives `origin`
 * from the app identifier in context (app_name / app_bundle_id) and `page_path`
 * by stripping the app:// scheme. So the SDK emits the screen name as-is and
 * must NOT encode an app host in the URL — doing so would leak the host into the
 * backend-derived page_path.
 */
describe("generateScreenEvent page_url", () => {
  beforeEach(() => initStorageManager("screen-test-key"));

  it("emits the screen name as app://<name>", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("Home");
    expect(evt.context?.page_url).toBe("app://Home");
    expect(evt.context?.page_title).toBe("Home");
  });

  it("passes router-style paths through unchanged", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("/tabs/leaderboard");
    expect(evt.context?.page_url).toBe("app:///tabs/leaderboard");
  });

  it("does NOT encode the app bundle id into the URL (backend owns origin)", async () => {
    const factory = new EventFactory({ app: { bundleId: "com.formo.test" } });
    const evt = await factory.generateScreenEvent("Wallet");
    expect(evt.context?.page_url).toBe("app://Wallet");
    expect(String(evt.context?.page_url)).not.toContain("com.formo.test");
  });

  it("keeps user-supplied context (spread last)", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("Home", undefined, undefined, {
      page_url: "app://Custom",
    });
    expect(evt.context?.page_url).toBe("app://Custom");
  });
});
