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

// Simulate a stalled Play Store service: the callback is never invoked.
jest.mock(
  "react-native-play-install-referrer",
  () => ({
    PlayInstallReferrer: {
      getInstallReferrerInfo: () => {
        /* intentionally never calls back */
      },
    },
  }),
  { virtual: true }
);

import { captureInstallReferrer } from "../lib/installReferrer";

describe("captureInstallReferrer — hung native call", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockStorageInstance.get.mockReturnValue(null);
    mockStorageInstance.setAsync.mockClear();
    mockStorageManager.hasPersistentStorage.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves (does not hang init) when the Play callback never fires", async () => {
    const promise = captureInstallReferrer();
    // Advance past the bound; if the timeout were missing this would never settle
    // and the test would time out.
    jest.advanceTimersByTime(3001);
    await expect(promise).resolves.toBeUndefined();
  });

  it("does not mark attribution resolved on timeout, so it retries next launch", async () => {
    const promise = captureInstallReferrer();
    jest.advanceTimersByTime(3001);
    await promise;

    // The one-shot flag must NOT be persisted — a timeout is transient.
    expect(mockStorageInstance.setAsync).not.toHaveBeenCalledWith(
      "install_referrer_resolved",
      "true"
    );
  });
});
