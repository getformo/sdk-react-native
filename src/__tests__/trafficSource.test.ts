import {
  parseTrafficSource,
  storeTrafficSource,
  getStoredTrafficSource,
  clearTrafficSource,
  mergeTrafficSourceFill,
} from "../utils/trafficSource";
import { initStorageManager } from "../lib/storage";

describe("trafficSource", () => {
  beforeEach(async () => {
    const mgr = initStorageManager("test-write-key");
    // Initialize with an in-memory AsyncStorage mock
    const store = new Map<string, string>();
    await mgr.initialize({
      getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      },
      removeItem: (k: string) => {
        store.delete(k);
        return Promise.resolve();
      },
      getAllKeys: () => Promise.resolve(Array.from(store.keys())),
      multiGet: (keys: readonly string[]) =>
        Promise.resolve(keys.map((k) => [k, store.get(k) ?? null] as [string, string | null])),
      multiRemove: (keys: readonly string[]) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve();
      },
    });
    clearTrafficSource();
  });

  describe("parseTrafficSource", () => {
    it("extracts UTM params from a standard URL", () => {
      const ts = parseTrafficSource(
        "https://example.com/?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=shoes&utm_content=ad1"
      );
      expect(ts.utm_source).toBe("google");
      expect(ts.utm_medium).toBe("cpc");
      expect(ts.utm_campaign).toBe("spring");
      expect(ts.utm_term).toBe("shoes");
      expect(ts.utm_content).toBe("ad1");
      expect(ts.referrer).toBe(
        "https://example.com/?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=shoes&utm_content=ad1"
      );
    });

    it("extracts UTM params from a deep-link URL", () => {
      const ts = parseTrafficSource(
        "myapp://product?utm_source=twitter&utm_medium=social&ref=friend123"
      );
      expect(ts.utm_source).toBe("twitter");
      expect(ts.utm_medium).toBe("social");
      expect(ts.ref).toBe("friend123");
    });

    it("falls back to query-only parsing when URL is not standard", () => {
      // Force parser into fallback path
      const ts = parseTrafficSource("not-a-url?utm_source=x&ref=abc");
      expect(ts.utm_source).toBe("x");
      expect(ts.ref).toBe("abc");
    });

    it("picks the first matching referral param", () => {
      const ts = parseTrafficSource(
        "https://example.com/?referral=first&ref=second"
      );
      expect(ts.ref).toBe("second"); // "ref" appears first in default list
    });

    it("supports custom referral query params", () => {
      const ts = parseTrafficSource(
        "https://example.com/?partner_code=alice",
        ["partner_code"]
      );
      expect(ts.ref).toBe("alice");
    });
  });

  describe("mergeTrafficSourceFill", () => {
    it("fills only empty fields, never clobbers existing values", () => {
      storeTrafficSource({
        utm_source: "twitter",
        utm_medium: "social",
        referrer: "myapp://deeplink",
      });

      mergeTrafficSourceFill({
        utm_source: "google", // should NOT overwrite
        utm_campaign: "spring", // should fill in
        referrer: "https://play.google.com/...", // should NOT overwrite
      });

      const stored = getStoredTrafficSource();
      expect(stored?.utm_source).toBe("twitter");
      expect(stored?.utm_medium).toBe("social");
      expect(stored?.utm_campaign).toBe("spring");
      expect(stored?.referrer).toBe("myapp://deeplink");
    });

    it("populates everything when storage is empty", () => {
      mergeTrafficSourceFill({
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "spring",
      });

      const stored = getStoredTrafficSource();
      expect(stored?.utm_source).toBe("google");
      expect(stored?.utm_medium).toBe("cpc");
      expect(stored?.utm_campaign).toBe("spring");
    });

    it("ignores empty-string incoming values", () => {
      storeTrafficSource({ utm_source: "twitter" });
      mergeTrafficSourceFill({ utm_source: "", utm_medium: "" });

      const stored = getStoredTrafficSource();
      expect(stored?.utm_source).toBe("twitter");
      expect(stored?.utm_medium).toBeUndefined();
    });
  });
});
