import { synthesizeUserAgent } from "../lib/event/EventFactory";

/**
 * The ingestion pipeline (Tinybird dedup_raw_events) classifies device + os
 * SOLELY from the lowercased user_agent string. A mobile event with an empty UA
 * is bucketed device=os='unknown'. These tests pin the synthesized UA to the
 * exact tokens that classifier matches, so mobile device/os resolve correctly:
 *   device: 'iphone|ipod'->mobile-ios, 'ipad'->tablet,
 *           'android'+'mobile'->mobile-android, 'android'+tablet/no-mobile->tablet
 *   os:     'iphone|ipad|ipod'->ios, 'android[ /]<ver>'->android
 */
describe("synthesizeUserAgent", () => {
  const ua = (o: Partial<Parameters<typeof synthesizeUserAgent>[0]>) =>
    synthesizeUserAgent({
      os_name: "",
      os_version: "",
      device_model: "",
      device_type: "mobile",
      ...o,
    }).toLowerCase();

  it("iOS phone → classifies as mobile-ios (has 'iphone', no 'ipad')", () => {
    const s = ua({ os_name: "iOS", os_version: "17.4.1", device_type: "mobile" });
    expect(s).toContain("iphone");
    expect(s).not.toContain("ipad");
    // os regex expects 'iphone os <digits>_<digits>'
    expect(/iphone os [\d_]+ like mac os x/.test(s)).toBe(true);
  });

  it("iOS tablet → classifies as tablet (has 'ipad')", () => {
    const s = ua({ os_name: "iOS", os_version: "17.4", device_type: "tablet" });
    expect(s).toContain("ipad");
  });

  it("Android phone → mobile-android (has 'android' + 'mobile', versioned)", () => {
    const s = ua({ os_name: "Android", os_version: "14", device_model: "Pixel 8", device_type: "mobile" });
    expect(s).toContain("android");
    expect(s).toContain("mobile");
    expect(/android[/ ][\d.]+/.test(s)).toBe(true);
  });

  it("Android tablet → tablet (has 'android' + tablet token, NOT 'mobile')", () => {
    const s = ua({ os_name: "Android", os_version: "13", device_model: "Tab S9", device_type: "tablet" });
    expect(s).toContain("android");
    expect(s).toContain("tablet");
    expect(s).not.toContain("mobile");
  });

  it("handles Expo's capitalized osName and lowercase Platform.OS alike", () => {
    expect(ua({ os_name: "ios" })).toContain("iphone");
    expect(ua({ os_name: "iOS" })).toContain("iphone");
  });

  it("returns empty string for unknown platforms (no false classification)", () => {
    expect(synthesizeUserAgent({ os_name: "windows", os_version: "11", device_model: "PC", device_type: "mobile" })).toBe("");
  });
});
