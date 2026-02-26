import { AppState, AppStateStatus } from "react-native";

// Mock storage instance
const mockStorageInstance = {
  get: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
  isAvailable: jest.fn(),
};

jest.mock("../lib/storage", () => ({
  __esModule: true,
  storage: jest.fn(),
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

// react-native and react-native-device-info are mocked globally in jest.setup.js

import { LifecycleEventTracker } from "../lib/lifecycle/LifecycleEventTracker";
import { storage } from "../lib/storage";

// Track the AppState listener callback
let appStateCallback: ((state: AppStateStatus) => void) | null = null;
const mockRemove = jest.fn();

const setupMocks = () => {
  mockStorageInstance.get.mockReturnValue(null);
  mockStorageInstance.set.mockReturnValue(undefined);
  mockStorageInstance.remove.mockReturnValue(undefined);
  mockStorageInstance.isAvailable.mockReturnValue(true);
  mockRemove.mockReturnValue(undefined);

  (storage as jest.Mock).mockReturnValue(mockStorageInstance);

  (AppState.addEventListener as jest.Mock).mockImplementation(
    (_event: string, callback: (state: AppStateStatus) => void) => {
      appStateCallback = callback;
      return { remove: mockRemove };
    }
  );
};

describe("LifecycleEventTracker", () => {
  let trackFn: jest.Mock;

  beforeEach(() => {
    appStateCallback = null;
    trackFn = jest.fn().mockResolvedValue(undefined);
    setupMocks();
  });

  describe("Application Installed", () => {
    it("should fire Application Installed on first launch (no stored version)", async () => {
      mockStorageInstance.get.mockReturnValue(null);

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      expect(trackFn).toHaveBeenCalledWith("Application Installed", {
        version: "1.0.0",
        build: "1",
      });
      tracker.cleanup();
    });

    it("should persist version after install", async () => {
      mockStorageInstance.get.mockReturnValue(null);

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      expect(mockStorageInstance.set).toHaveBeenCalledWith(
        "lifecycle_app_version",
        "1.0.0"
      );
      expect(mockStorageInstance.set).toHaveBeenCalledWith(
        "lifecycle_app_build",
        "1"
      );
      tracker.cleanup();
    });
  });

  describe("Application Updated", () => {
    it("should fire Application Updated when version changes", async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === "lifecycle_app_version") return "0.9.0";
        if (key === "lifecycle_app_build") return "50";
        return null;
      });

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      expect(trackFn).toHaveBeenCalledWith("Application Updated", {
        version: "1.0.0",
        build: "1",
        previous_version: "0.9.0",
        previous_build: "50",
      });
      tracker.cleanup();
    });

    it("should fire Application Updated when only build changes", async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === "lifecycle_app_version") return "1.0.0";
        if (key === "lifecycle_app_build") return "0";
        return null;
      });

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      expect(trackFn).toHaveBeenCalledWith("Application Updated", {
        version: "1.0.0",
        build: "1",
        previous_version: "1.0.0",
        previous_build: "0",
      });
      tracker.cleanup();
    });

    it("should NOT fire Application Installed when a previous version exists", async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === "lifecycle_app_version") return "0.9.0";
        if (key === "lifecycle_app_build") return "50";
        return null;
      });

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      expect(trackFn).not.toHaveBeenCalledWith(
        "Application Installed",
        expect.anything()
      );
      tracker.cleanup();
    });
  });

  describe("Application Opened", () => {
    it("should fire Application Opened with from_background: false on cold start", async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === "lifecycle_app_version") return "1.0.0";
        if (key === "lifecycle_app_build") return "1";
        return null;
      });

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      expect(trackFn).toHaveBeenCalledWith("Application Opened", {
        version: "1.0.0",
        build: "1",
        from_background: false,
      });
      tracker.cleanup();
    });

    it("should fire Application Opened with from_background: true when returning from background", async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === "lifecycle_app_version") return "1.0.0";
        if (key === "lifecycle_app_build") return "1";
        return null;
      });

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      trackFn.mockClear();

      // Simulate going to background then coming back
      appStateCallback!("background");
      await new Promise<void>((r) => setTimeout(r, 0));
      appStateCallback!("active");
      await new Promise<void>((r) => setTimeout(r, 0));

      expect(trackFn).toHaveBeenCalledWith("Application Opened", {
        version: "1.0.0",
        build: "1",
        from_background: true,
      });
      tracker.cleanup();
    });

    it("should always fire Application Opened on cold start even after install", async () => {
      mockStorageInstance.get.mockReturnValue(null);

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      // Should fire both Installed and Opened
      expect(trackFn).toHaveBeenCalledWith(
        "Application Installed",
        expect.anything()
      );
      expect(trackFn).toHaveBeenCalledWith("Application Opened", {
        version: "1.0.0",
        build: "1",
        from_background: false,
      });
      tracker.cleanup();
    });
  });

  describe("Application Backgrounded", () => {
    it("should fire Application Backgrounded when app goes to background", async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === "lifecycle_app_version") return "1.0.0";
        if (key === "lifecycle_app_build") return "1";
        return null;
      });

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      trackFn.mockClear();

      appStateCallback!("background");
      await new Promise<void>((r) => setTimeout(r, 0));

      expect(trackFn).toHaveBeenCalledWith("Application Backgrounded", {});
      tracker.cleanup();
    });
  });

  describe("same version (no install or update)", () => {
    it("should NOT fire Installed or Updated when version matches", async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === "lifecycle_app_version") return "1.0.0";
        if (key === "lifecycle_app_build") return "1";
        return null;
      });

      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      expect(trackFn).not.toHaveBeenCalledWith(
        "Application Installed",
        expect.anything()
      );
      expect(trackFn).not.toHaveBeenCalledWith(
        "Application Updated",
        expect.anything()
      );
      // But Opened should still fire
      expect(trackFn).toHaveBeenCalledWith(
        "Application Opened",
        expect.anything()
      );
      tracker.cleanup();
    });
  });

  describe("options.app override", () => {
    it("should use app version from options when provided", async () => {
      mockStorageInstance.get.mockReturnValue(null);

      const tracker = new LifecycleEventTracker(trackFn, {
        app: { version: "3.0.0", build: "200" },
      });
      await tracker.start();

      expect(trackFn).toHaveBeenCalledWith("Application Installed", {
        version: "3.0.0",
        build: "200",
      });
      tracker.cleanup();
    });
  });

  describe("cleanup", () => {
    it("should remove AppState listener on cleanup", async () => {
      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();

      tracker.cleanup();

      expect(mockRemove).toHaveBeenCalled();
    });

    it("should not start twice", async () => {
      const tracker = new LifecycleEventTracker(trackFn);
      await tracker.start();
      await tracker.start();

      // AppState.addEventListener should only be called once
      expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
      tracker.cleanup();
    });
  });
});
