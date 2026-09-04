/**
 * SDK init awaits captureInstallReferrer so the referrer is available when the
 * Application Installed event fires. That makes a hung native call dangerous:
 * if the Play Store service connection stalls and the callback never arrives,
 * an unbounded await would block FormoAnalytics.init() forever, leaving every
 * consumer on the no-op context with tracking silently dead.
 *
 * These tests pin the timeout that prevents that.
 */

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

const mockStorageInstance = {
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  setAsync: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn(),
  isAvailable: jest.fn().mockReturnValue(true),
};

const mockStorageManager = {
  hasPersistentStorage: jest.fn().mockReturnValue(true),
};

jest.mock("../lib/storage", () => ({
  __esModule: true,
  storage: jest.fn(() => mockStorageInstance),
  getStorageManager: jest.fn(() => mockStorageManager),
}));

jest.mock("../lib/logger", () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

const mockGetInstallReferrerInfo = jest.fn();
jest.mock(
  "react-native-play-install-referrer",
  () => ({
    PlayInstallReferrer: {
      getInstallReferrerInfo: mockGetInstallReferrerInfo,
    },
  }),
  { virtual: true }
);

import { captureInstallReferrer } from "../lib/installReferrer";
import { Platform } from "react-native";
import { getStorageManager, storage } from "../lib/storage";

describe("captureInstallReferrer — hung native call", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (Platform as { OS: string }).OS = "android";
    mockStorageInstance.get.mockReturnValue(null);
    mockStorageInstance.set.mockClear();
    mockStorageInstance.setAsync.mockClear();
    mockStorageManager.hasPersistentStorage.mockReturnValue(true);
    mockGetInstallReferrerInfo.mockClear();
    (getStorageManager as jest.Mock).mockReturnValue(mockStorageManager);
    (storage as jest.Mock).mockReturnValue(mockStorageInstance);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves (does not hang init) when the Play callback never fires", async () => {
    const promise = captureInstallReferrer();
    // Advance past the bound; if the timeout were missing this would never settle
    // and the test would time out.
    jest.advanceTimersByTime(1501);
    await expect(promise).resolves.toBeUndefined();
  });

  it("does not mark attribution resolved on timeout, so it retries next launch", async () => {
    const promise = captureInstallReferrer();
    jest.advanceTimersByTime(1501);
    await promise;

    // The one-shot flag must NOT be persisted — a timeout is transient.
    expect(mockStorageInstance.setAsync).not.toHaveBeenCalledWith(
      "install_referrer_resolved",
      "true"
    );
  });

  it("does not capture without consent", async () => {
    await captureInstallReferrer({ canCapture: () => false });

    expect(mockGetInstallReferrerInfo).not.toHaveBeenCalled();
  });

  it("discards a result after consent changes", async () => {
    let generation = 0;
    const started = generation;
    const promise = captureInstallReferrer({
      canCapture: () => generation === started,
    });
    await Promise.resolve();
    expect(Platform.OS).toBe("android");
    expect(mockGetInstallReferrerInfo).toHaveBeenCalledTimes(1);
    const callback = mockGetInstallReferrerInfo.mock.calls[0][0];

    generation++;
    callback({ installReferrer: "utm_source=test" });
    await promise;

    expect(mockStorageInstance.set).not.toHaveBeenCalled();
    expect(mockStorageInstance.setAsync).not.toHaveBeenCalled();
  });
});
