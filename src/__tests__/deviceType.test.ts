import { resolveExpoDeviceType } from "../lib/event/EventFactory";

/**
 * getDeviceInfo()'s Expo branch runs when EITHER expo-device or
 * expo-application is installed. With only expo-application present,
 * `ExpoDevice` is null, so `ExpoDevice?.deviceType` and
 * `ExpoDevice?.DeviceType?.TABLET` are both undefined — and the original
 * `===` comparison reported every such device as a tablet. That flowed into
 * context.device_type, flipped the synthesized user agent to iPad/Tablet, and
 * showed real phones under Tablet in the dashboard's device breakdown.
 *
 * expo-device's DeviceType enum: UNKNOWN=0, PHONE=1, TABLET=2, DESKTOP=3, TV=4.
 */
describe("resolveExpoDeviceType", () => {
  it("returns mobile when expo-device is absent (both args undefined)", () => {
    expect(resolveExpoDeviceType(undefined, undefined)).toBe("mobile");
  });

  it("returns mobile when only the enum is missing", () => {
    expect(resolveExpoDeviceType(2, undefined)).toBe("mobile");
  });

  it("returns mobile when only the device type is missing", () => {
    expect(resolveExpoDeviceType(undefined, 2)).toBe("mobile");
  });

  it("returns tablet for a real tablet", () => {
    expect(resolveExpoDeviceType(2, 2)).toBe("tablet");
  });

  it("returns mobile for a phone", () => {
    expect(resolveExpoDeviceType(1, 2)).toBe("mobile");
  });

  it("returns mobile for DeviceType.UNKNOWN (0), not tablet", () => {
    // Guards the null-check being written as a falsy check: 0 is a valid enum
    // member and must not be treated as "missing" in a way that changes intent.
    expect(resolveExpoDeviceType(0, 2)).toBe("mobile");
  });

  it("returns mobile for desktop and TV form factors", () => {
    expect(resolveExpoDeviceType(3, 2)).toBe("mobile");
    expect(resolveExpoDeviceType(4, 2)).toBe("mobile");
  });

  it("handles null the same as undefined", () => {
    expect(resolveExpoDeviceType(null, null)).toBe("mobile");
  });
});
