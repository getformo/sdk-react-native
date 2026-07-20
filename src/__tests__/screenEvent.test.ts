import { EventFactory } from "../lib/event/EventFactory";
import { initStorageManager } from "../lib/storage";

/**
 * Mobile screen views are emitted as type="page" so they flow through the same
 * Tinybird materializations as web page views. The pipeline derives:
 *   origin    = domainWithoutWWW(page_url)   -> the URL HOST
 *   page_path = path(page_url)               -> the URL PATH
 * So the screen name must live in the PATH under a stable per-app HOST. If it
 * were the host (the old `app://${name}`), every screen would be its own origin
 * (fragmenting sessions) and page_path would be empty (no top-pages data).
 */
describe("generateScreenEvent page_url", () => {
  beforeEach(() => initStorageManager("screen-test-key"));

  it("puts the screen name in the path under the app bundle id host", async () => {
    const factory = new EventFactory({ app: { bundleId: "com.formo.test" } });
    const evt = await factory.generateScreenEvent("HomeScreen");
    expect(evt.context?.page_url).toBe("app://com.formo.test/HomeScreen");
    // host (origin) is the stable bundle id; path is the screen name
    expect(evt.context?.page_title).toBe("HomeScreen");
  });

  it("falls back to a stable 'app' host when no bundle id is configured", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("Profile");
    expect(evt.context?.page_url).toBe("app://app/Profile");
  });

  it("does not double the leading slash for path-style screen names", async () => {
    const factory = new EventFactory();
    const evt = await factory.generateScreenEvent("/settings/account");
    expect(evt.context?.page_url).toBe("app://app/settings/account");
  });

  it("keeps every screen under the SAME host so sessions don't fragment", async () => {
    const factory = new EventFactory({ app: { bundleId: "com.formo.test" } });
    const a = await factory.generateScreenEvent("A");
    const b = await factory.generateScreenEvent("B");
    const host = (u?: unknown) => String(u).split("/")[2]; // app://<host>/...
    expect(host(a.context?.page_url)).toBe(host(b.context?.page_url));
  });
});
