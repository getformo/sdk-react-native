import {
  redactQueryString,
  redactUrl,
  resolveExcludedQueryParams,
} from "../utils/urlSanitizer";

describe("resolveExcludedQueryParams", () => {
  it("always contains the built-in Privy parameters", () => {
    for (const options of [undefined, {}, { tracking: true }, { tracking: {} }]) {
      const excluded = resolveExcludedQueryParams(options as never);
      expect([...excluded].sort()).toEqual([
        "privy_oauth_code",
        "privy_oauth_provider",
        "privy_oauth_state",
      ]);
    }
  });

  it("adds the app's names, lowercased, and ignores non-strings", () => {
    const excluded = resolveExcludedQueryParams({
      tracking: { excludeQueryParams: ["Token", 5 as never, "email"] },
    });
    expect(excluded.has("token")).toBe(true);
    expect(excluded.has("email")).toBe(true);
    expect(excluded.has("privy_oauth_code")).toBe(true);
    expect(excluded.size).toBe(5);
  });
});

describe("redactUrl", () => {
  const excluded = new Set(["token", "privy_oauth_code", "my key"]);

  it.each([
    // [input, expected]
    ["myapp://join?token=1&utm_source=x", "myapp://join?utm_source=x"],
    ["myapp://join?utm_source=x&token=1", "myapp://join?utm_source=x"],
    ["myapp://join?a=1&token=1&b=2", "myapp://join?a=1&b=2"],
    // Nothing left: the "?" goes too.
    ["myapp://?privy_oauth_code=1", "myapp://"],
    ["myapp://join?token=1#section", "myapp://join#section"],
    // Case-insensitive, repeated, valueless and encoded names.
    ["https://a.io/p?TOKEN=1&Token=2&x=3", "https://a.io/p?x=3"],
    ["https://a.io/p?token&x=3", "https://a.io/p?x=3"],
    ["https://a.io/p?my%20key=1&my+key=2&x=3", "https://a.io/p?x=3"],
    // A bare query string: the shape of a saved Play install referrer.
    ["utm_source=google&token=1", "utm_source=google"],
  ])("%s -> %s", (input, expected) => {
    expect(redactUrl(input, excluded)).toBe(expected);
  });

  it.each([
    "myapp://home",
    "myapp://join?utm_source=x&tokenish=1",
    // A value that merely contains an excluded name is not a parameter.
    "myapp://join?next=token%3D1",
    // The fragment is left untouched, as in the web SDK.
    "myapp://join#token=1",
    "myapp://join?a=%E0%A4%A",
    // A scheme and no "?": not a query string, even with "=" in it.
    "myapp:token=1",
    "utm_source=google&utm_medium=cpc",
    "",
  ])("returns %s unchanged", (input) => {
    expect(redactUrl(input, excluded)).toBe(input);
  });

  it("does nothing with an empty denylist", () => {
    expect(redactUrl("a://b?token=1", new Set())).toBe("a://b?token=1");
  });
});

describe("redactQueryString", () => {
  it("strips from a bare query string (the Play install referrer)", () => {
    const excluded = new Set(["token"]);
    expect(redactQueryString("utm_source=g&token=1", excluded)).toBe("utm_source=g");
    expect(redactQueryString("token=1", excluded)).toBe("");
    expect(redactQueryString("utm_source=g", excluded)).toBe("utm_source=g");
  });
});
