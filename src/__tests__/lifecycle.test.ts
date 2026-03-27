import { AppState } from 'react-native';

// Mock react-native
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  },
  Linking: {
    getInitialURL: jest.fn().mockResolvedValue(null),
  },
}));

// Mock storage
const mockStorageInstance = {
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  remove: jest.fn(),
  isAvailable: jest.fn().mockReturnValue(true),
};

const mockStorageManager = {
  hasPersistentStorage: jest.fn().mockReturnValue(true),
};

jest.mock('../lib/storage', () => ({
  __esModule: true,
  storage: jest.fn(() => mockStorageInstance),
  getStorageManager: jest.fn(() => mockStorageManager),
}));

jest.mock('../lib/logger', () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

import { AppLifecycleManager } from '../lib/lifecycle';
import { storage, getStorageManager } from '../lib/storage';
import { Linking } from 'react-native';

describe('AppLifecycleManager', () => {
  let manager: AppLifecycleManager;
  let mockAnalytics: { track: jest.Mock };

  beforeEach(() => {
    mockAnalytics = { track: jest.fn().mockResolvedValue(undefined) };
    mockStorageInstance.get.mockReturnValue(null);
    mockStorageInstance.set.mockReturnValue(undefined);
    mockStorageManager.hasPersistentStorage.mockReturnValue(true);
    (storage as jest.Mock).mockReturnValue(mockStorageInstance);
    (getStorageManager as jest.Mock).mockReturnValue(mockStorageManager);
    (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: jest.fn() });
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(null);
    manager = new AppLifecycleManager(mockAnalytics);
  });

  describe('first install', () => {
    it('should fire Application Installed on first launch', async () => {
      mockStorageInstance.get.mockReturnValue(null);

      await manager.start({ version: '1.0.0', build: '1' });

      expect(mockAnalytics.track).toHaveBeenCalledWith('Application Installed', {
        version: '1.0.0',
        build: '1',
      });
    });

    it('should fire Application Opened after install', async () => {
      mockStorageInstance.get.mockReturnValue(null);

      await manager.start({ version: '1.0.0', build: '1' });

      expect(mockAnalytics.track).toHaveBeenCalledWith('Application Opened', {
        version: '1.0.0',
        build: '1',
        from_background: false,
      });
    });

    it('should persist version and build after install', async () => {
      mockStorageInstance.get.mockReturnValue(null);

      await manager.start({ version: '1.0.0', build: '1' });

      expect(mockStorageInstance.set).toHaveBeenCalledWith('app_version', '1.0.0');
      expect(mockStorageInstance.set).toHaveBeenCalledWith('app_build', '1');
    });
  });

  describe('app update', () => {
    it('should fire Application Updated when version changes', async () => {
      // Simulate stored version differs from current
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === 'app_version') return '1.0.0';
        if (key === 'app_build') return '1';
        return null;
      });

      await manager.start({ version: '2.0.0', build: '2' });

      expect(mockAnalytics.track).toHaveBeenCalledWith('Application Updated', {
        version: '2.0.0',
        build: '2',
        previous_version: '1.0.0',
        previous_build: '1',
      });
    });

    it('should fire Application Updated when only build changes', async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === 'app_version') return '1.0.0';
        if (key === 'app_build') return '1';
        return null;
      });

      await manager.start({ version: '1.0.0', build: '2' });

      expect(mockAnalytics.track).toHaveBeenCalledWith('Application Updated', {
        version: '1.0.0',
        build: '2',
        previous_version: '1.0.0',
        previous_build: '1',
      });
    });
  });

  describe('regular open', () => {
    it('should not fire Installed or Updated when version matches', async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === 'app_version') return '1.0.0';
        if (key === 'app_build') return '1';
        return null;
      });

      await manager.start({ version: '1.0.0', build: '1' });

      expect(mockAnalytics.track).not.toHaveBeenCalledWith(
        'Application Installed',
        expect.anything()
      );
      expect(mockAnalytics.track).not.toHaveBeenCalledWith(
        'Application Updated',
        expect.anything()
      );
    });

    it('should still fire Application Opened on regular launch', async () => {
      mockStorageInstance.get.mockImplementation((key: string) => {
        if (key === 'app_version') return '1.0.0';
        if (key === 'app_build') return '1';
        return null;
      });

      await manager.start({ version: '1.0.0', build: '1' });

      expect(mockAnalytics.track).toHaveBeenCalledWith('Application Opened', {
        version: '1.0.0',
        build: '1',
        from_background: false,
      });
    });
  });

  describe('AppState transitions', () => {
    it('should subscribe to AppState changes', async () => {
      await manager.start({ version: '1.0.0', build: '1' });

      expect(AppState.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should fire Application Backgrounded on background', async () => {
      await manager.start({ version: '1.0.0', build: '1' });

      // Get the AppState callback
      const callback = (AppState.addEventListener as jest.Mock).mock.calls[0][1];

      // Simulate going to background
      callback('background');

      expect(mockAnalytics.track).toHaveBeenCalledWith('Application Backgrounded', {
        version: '1.0.0',
        build: '1',
      });
    });

    it('should fire Application Opened with from_background on foreground return', async () => {
      await manager.start({ version: '1.0.0', build: '1' });

      const callback = (AppState.addEventListener as jest.Mock).mock.calls[0][1];

      // Simulate background then foreground
      callback('background');
      mockAnalytics.track.mockClear();
      callback('active');

      expect(mockAnalytics.track).toHaveBeenCalledWith('Application Opened', {
        version: '1.0.0',
        build: '1',
        from_background: true,
      });
    });

    it('should ignore inactive state', async () => {
      await manager.start({ version: '1.0.0', build: '1' });

      const callback = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
      mockAnalytics.track.mockClear();

      callback('inactive');

      expect(mockAnalytics.track).not.toHaveBeenCalled();
    });
  });

  describe('no persistent storage', () => {
    it('should skip install/update detection when AsyncStorage is not available', async () => {
      mockStorageManager.hasPersistentStorage.mockReturnValue(false);

      await manager.start({ version: '1.0.0', build: '1' });

      expect(mockAnalytics.track).not.toHaveBeenCalledWith(
        'Application Installed',
        expect.anything()
      );
      expect(mockAnalytics.track).not.toHaveBeenCalledWith(
        'Application Updated',
        expect.anything()
      );
    });

    it('should still fire Application Opened without persistent storage', async () => {
      mockStorageManager.hasPersistentStorage.mockReturnValue(false);

      await manager.start({ version: '1.0.0', build: '1' });

      expect(mockAnalytics.track).toHaveBeenCalledWith('Application Opened', {
        version: '1.0.0',
        build: '1',
        from_background: false,
      });
    });
  });

  describe('cleanup', () => {
    it('should remove AppState listener on cleanup', async () => {
      const mockRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      await manager.start({ version: '1.0.0', build: '1' });
      manager.cleanup();

      expect(mockRemove).toHaveBeenCalled();
    });
  });
});
