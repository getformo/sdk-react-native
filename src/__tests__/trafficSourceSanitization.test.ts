import {
  parseTrafficSource,
  storeTrafficSource,
  getStoredTrafficSource,
  clearTrafficSource,
  updateStoredTrafficSource,
} from "../utils/trafficSource";
import {
  sanitizeRef,
  sanitizeUtm,
  sanitizeReferrer,
  sanitizeTrafficSources,
} from "../utils/sanitize";
import { initStorageManager } from "../lib/storage";

/**
 * Traffic-source sanitization (ported from the web SDK's #307).
 *
 * On React Native the hostile input is a deep link or the Android Play install
 * referrer rather than a scanner crawling a website, but the outcome is the
 * same: an attacker-chosen string persisted as sticky session attribution and
 * replayed onto every subsequent event.
 */
describe("traffic source sanitization", () => {
  beforeEach(async () => {
    const mgr = initStorageManager("test-write-key");
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
        Promise.resolve(
          keys.map((k) => [k, store.get(k) ?? null] as [string, string | null])
        ),
      multiRemove: (keys: readonly string[]) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve();
      },
    });
    clearTrafficSource();
  });

  describe("sanitizeRef", () => {
    it("keeps legitimate short referral tokens", () => {
      expect(sanitizeRef("friend123")).toBe("friend123");
      expect(sanitizeRef("ABC-123_x.y")).toBe("ABC-123_x.y");
    });

    it("drops markup, scripts and non-ASCII", () => {
      expect(sanitizeRef("<script>alert(1)</script>")).toBe("");
      expect(sanitizeRef("javascript:alert(1)")).toBe("");
      expect(sanitizeRef("café")).toBe("");
      expect(sanitizeRef("code with spaces")).toBe("");
    });

    it("drops values longer than 64 characters", () => {
      expect(sanitizeRef("a".repeat(64))).toBe("a".repeat(64));
      expect(sanitizeRef("a".repeat(65))).toBe("");
    });

    it("drops the empty string", () => {
      expect(sanitizeRef("")).toBe("");
    });
  });

  describe("sanitizeUtm", () => {
    it("keeps free-form campaign values", () => {
      expect(sanitizeUtm("spring sale 2026")).toBe("spring sale 2026");
      expect(sanitizeUtm("black+friday")).toBe("black+friday");
      expect(sanitizeUtm("Sommerkampagne für Schuhe")).toBe(
        "Sommerkampagne für Schuhe"
      );
    });

    it("rejects markup and quote characters", () => {
      expect(sanitizeUtm("<script>alert(1)</script>")).toBe("");
      expect(sanitizeUtm(`"onload="alert(1)`)).toBe("");
      expect(sanitizeUtm("'\"><xsstag>()locxss")).toBe("");
      expect(sanitizeUtm("back\\slash")).toBe("");
    });

    it("rejects dangerous scheme prefixes", () => {
      expect(sanitizeUtm("javascript:alert(1)")).toBe("");
      expect(sanitizeUtm("  JavaScript:alert(1)")).toBe("");
      expect(sanitizeUtm("data:text/html;base64,PHN2Zz4=")).toBe("");
      expect(sanitizeUtm("vbscript:msgbox(1)")).toBe("");
    });

    it("rejects control, zero-width and replacement characters", () => {
      expect(sanitizeUtm("goo\u0000gle")).toBe("");
      expect(sanitizeUtm("goo\tgle")).toBe("");
      expect(sanitizeUtm("goo\ngle")).toBe("");
      expect(sanitizeUtm("goo\u200bgle")).toBe("");
      expect(sanitizeUtm("goo\u202egle")).toBe("");
      expect(sanitizeUtm("\ufeffgoogle")).toBe("");
      expect(sanitizeUtm("goo\ufffdgle")).toBe("");
    });

    it("rejects absurdly long values", () => {
      expect(sanitizeUtm("a".repeat(255))).toBe("a".repeat(255));
      expect(sanitizeUtm("a".repeat(256))).toBe("");
    });
  });

  describe("sanitizeReferrer", () => {
    it("keeps ordinary deep links and web URLs", () => {
      expect(sanitizeReferrer("myapp://product?utm_source=twitter")).toBe(
        "myapp://product?utm_source=twitter"
      );
      expect(sanitizeReferrer("https://example.com/a/b?c=d&e=f")).toBe(
        "https://example.com/a/b?c=d&e=f"
      );
    });

    it("drops URLs carrying an unencoded payload", () => {
      expect(
        sanitizeReferrer("myapp://x?utm_source=<script>alert(1)</script>")
      ).toBe("");
      expect(sanitizeReferrer("javascript:alert(1)")).toBe("");
    });

    it("allows URLs longer than the UTM budget but bounds them at 2048", () => {
      const long = `https://example.com/?q=${"a".repeat(1_000)}`;
      expect(sanitizeReferrer(long)).toBe(long);
      expect(sanitizeReferrer(`https://example.com/?q=${"a".repeat(2_048)}`)).toBe(
        ""
      );
    });
  });

  describe("sanitizeTrafficSources", () => {
    it("applies the right rule per field", () => {
      expect(
        sanitizeTrafficSources({
          utm_source: "spring sale",
          utm_campaign: "<script>alert(1)</script>",
          ref: "friend123",
          referrer: "myapp://home",
        })
      ).toEqual({
        utm_source: "spring sale",
        utm_campaign: "",
        ref: "friend123",
        referrer: "myapp://home",
      });
    });

    it("uses the strict token rule for ref, not the loose UTM rule", () => {
      // A value with spaces passes the UTM rule but must fail as a ref.
      expect(sanitizeUtm("spring sale")).toBe("spring sale");
      expect(sanitizeTrafficSources({ ref: "spring sale" }).ref).toBe("");
    });

    it("leaves sparse objects and non-string values alone", () => {
      expect(sanitizeTrafficSources({})).toEqual({});
      expect(
        sanitizeTrafficSources({ utm_source: "" } as Record<string, string>)
      ).toEqual({ utm_source: "" });
    });
  });

  describe("parseTrafficSource", () => {
    it("drops a poisoned utm_source from a deep link", () => {
      const ts = parseTrafficSource(
        "myapp://product?utm_source=%3Cscript%3Ealert(1)%3C%2Fscript%3E&utm_medium=cpc"
      );
      expect(ts.utm_source).toBe("");
      expect(ts.utm_medium).toBe("cpc");
    });

    it("drops a poisoned ref from a deep link", () => {
      const ts = parseTrafficSource(
        "myapp://product?ref=javascript%3AdomxssExecutionSink(1)"
      );
      expect(ts.ref).toBe("");
    });

    it("drops a poisoned ref extracted via pathPattern", () => {
      const ts = parseTrafficSource(
        "https://example.com/invite/%3Cscript%3E",
        undefined,
        "^/invite/(.+)$"
      );
      expect(ts.ref).toBe("");
    });

    it("drops a poisoned ref from a custom query param", () => {
      const ts = parseTrafficSource(
        "myapp://x?partner_code=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
        ["partner_code"]
      );
      expect(ts.ref).toBe("");
    });

    it("keeps a clean deep link untouched", () => {
      const ts = parseTrafficSource(
        "myapp://product?utm_source=twitter&utm_medium=social&ref=friend123"
      );
      expect(ts).toMatchObject({
        utm_source: "twitter",
        utm_medium: "social",
        ref: "friend123",
        referrer: "myapp://product?utm_source=twitter&utm_medium=social&ref=friend123",
      });
    });

    it("sanitizes the referrer on the unparseable-URL fallback path", () => {
      // No "?" at all, so the parser returns { referrer: url } directly.
      const ts = parseTrafficSource("not a url <script>alert(1)</script>");
      expect(ts.referrer).toBe("");
    });

    it("sanitizes a poisoned Android install referrer query", () => {
      // The shape produced by lib/installReferrer for a Play referrer string.
      const ts = parseTrafficSource(
        "https://play.google.com/store/apps?utm_source=%3Cscript%3E&utm_campaign=spring"
      );
      expect(ts.utm_source).toBe("");
      expect(ts.utm_campaign).toBe("spring");
    });
  });

  describe("stored values", () => {
    it("flushes values poisoned by a pre-sanitization SDK on read", () => {
      // Simulate storage written by an older build that did not sanitize.
      storeTrafficSource({
        utm_source: "<script>alert(1)</script>",
        utm_campaign: "spring",
        ref: "friend123",
      });

      const stored = getStoredTrafficSource();
      expect(stored?.utm_source).toBe("");
      expect(stored?.utm_campaign).toBe("spring");
      expect(stored?.ref).toBe("friend123");
    });

    it("does not let a poisoned incoming value clobber a clean stored one", () => {
      updateStoredTrafficSource({ utm_source: "twitter", ref: "friend123" });
      // A later deep link carrying a payload must not win the per-field merge.
      updateStoredTrafficSource(
        parseTrafficSource("myapp://x?utm_source=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
      );

      const stored = getStoredTrafficSource();
      expect(stored?.utm_source).toBe("twitter");
      expect(stored?.ref).toBe("friend123");
    });
  });
});
