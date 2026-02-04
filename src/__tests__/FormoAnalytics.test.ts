import { FormoAnalytics } from '../FormoAnalytics';
import { initStorageManager, storage } from '../lib/storage';

// Mock dependencies
jest.mock('../lib/storage', () => ({
  initStorageManager: jest.fn(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
  })),
  storage: jest.fn(() => ({
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    remove: jest.fn(),
  })),
}));

jest.mock('../lib/event', () => ({
  EventManager: jest.fn().mockImplementation(() => ({
    addEvent: jest.fn().mockResolvedValue(undefined),
  })),
  EventQueue: jest.fn().mockImplementation(() => ({
    flush: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn(),
    cleanup: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../lib/session', () => ({
  FormoAnalyticsSession: jest.fn().mockImplementation(() => ({
    isWalletDetected: jest.fn().mockReturnValue(false),
    isWalletIdentified: jest.fn().mockReturnValue(false),
    markWalletDetected: jest.fn(),
    markWalletIdentified: jest.fn(),
    clear: jest.fn(),
  })),
}));

jest.mock('../lib/consent', () => ({
  setConsentFlag: jest.fn(),
  getConsentFlag: jest.fn().mockReturnValue(null),
  removeConsentFlag: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
  Logger: {
    init: jest.fn(),
  },
}));

describe('FormoAnalytics', () => {
  let analytics: FormoAnalytics;
  const writeKey = 'test-write-key';

  beforeEach(async () => {
    jest.clearAllMocks();
    analytics = await FormoAnalytics.init(writeKey);
  });

  describe('init()', () => {
    it('should initialize with writeKey', async () => {
      const instance = await FormoAnalytics.init('my-key');
      expect(instance.config.writeKey).toBe('my-key');
    });

    it('should call initStorageManager with writeKey', async () => {
      await FormoAnalytics.init('my-key');
      expect(initStorageManager).toHaveBeenCalledWith('my-key');
    });

    it('should call ready callback if provided', async () => {
      const readyCallback = jest.fn();
      await FormoAnalytics.init('my-key', { ready: readyCallback });
      expect(readyCallback).toHaveBeenCalled();
    });

    it('should initialize storage with asyncStorage if provided', async () => {
      const mockAsyncStorage = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      };
      const mockStorageManager = {
        initialize: jest.fn().mockResolvedValue(undefined),
      };
      (initStorageManager as jest.Mock).mockReturnValue(mockStorageManager);

      await FormoAnalytics.init('my-key', {}, mockAsyncStorage as any);

      expect(mockStorageManager.initialize).toHaveBeenCalledWith(mockAsyncStorage);
    });
  });

  describe('connect()', () => {
    it('should not track if chainId is null', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.connect({ chainId: null as any, address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2' });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if chainId is 0', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.connect({ chainId: 0, address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2' });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if address is empty', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.connect({ chainId: 1, address: '' });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if address is invalid', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.connect({ chainId: 1, address: 'invalid-address' });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should track valid connect event', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.connect({
        chainId: 1,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
      });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });

    it('should update currentChainId and currentAddress after connect', async () => {
      await analytics.connect({
        chainId: 1,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
      });

      expect(analytics.currentChainId).toBe(1);
      expect(analytics.currentAddress).toBeDefined();
    });
  });

  describe('disconnect()', () => {
    it('should track disconnect event', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.disconnect();

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });

    it('should clear currentAddress and currentChainId after disconnect', async () => {
      analytics.currentChainId = 1;
      analytics.currentAddress = '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2';

      await analytics.disconnect();

      expect(analytics.currentChainId).toBeUndefined();
      expect(analytics.currentAddress).toBeUndefined();
    });
  });

  describe('chain()', () => {
    beforeEach(async () => {
      // Set up a connected state
      analytics.currentAddress = '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2';
      analytics.currentChainId = 1;
    });

    it('should not track if chainId is empty', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.chain({ chainId: 0 });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if chainId is invalid', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.chain({ chainId: NaN });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if no address is available', async () => {
      analytics.currentAddress = undefined;
      const mockEventManager = (analytics as any).eventManager;

      await analytics.chain({ chainId: 137 });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should track valid chain change event', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.chain({ chainId: 137 });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });

    it('should update currentChainId after chain change', async () => {
      await analytics.chain({ chainId: 137 });

      expect(analytics.currentChainId).toBe(137);
    });
  });

  describe('signature()', () => {
    it('should not track if chainId is invalid', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.signature({
        status: 'requested',
        chainId: 0,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
        message: 'test message',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if address is empty', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.signature({
        status: 'requested',
        chainId: 1,
        address: '',
        message: 'test message',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should track valid signature event', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.signature({
        status: 'signed',
        chainId: 1,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
        message: 'test message',
        signatureHash: '0xabc123',
      });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });
  });

  describe('transaction()', () => {
    it('should not track if chainId is invalid', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.transaction({
        status: 'requested',
        chainId: 0,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if address is empty', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.transaction({
        status: 'requested',
        chainId: 1,
        address: '',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should track valid transaction event', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.transaction({
        status: 'confirmed',
        chainId: 1,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
        transactionHash: '0xdef456',
        value: '1000000000000000000',
      });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });
  });

  describe('track()', () => {
    it('should track custom events', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.track('button_click', { button_id: 'submit' });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });
  });

  describe('screen()', () => {
    it('should track screen views', async () => {
      const mockEventManager = (analytics as any).eventManager;

      await analytics.screen('HomeScreen', { section: 'featured' });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });
  });

  describe('opt-out tracking', () => {
    it('should return false for hasOptedOutTracking by default', () => {
      expect(analytics.hasOptedOutTracking()).toBe(false);
    });

    it('should set opt-out flag when optOutTracking is called', async () => {
      const { setConsentFlag } = require('../lib/consent');

      analytics.optOutTracking();

      expect(setConsentFlag).toHaveBeenCalled();
    });

    it('should remove opt-out flag when optInTracking is called', () => {
      const { removeConsentFlag } = require('../lib/consent');

      analytics.optInTracking();

      expect(removeConsentFlag).toHaveBeenCalled();
    });
  });

  describe('isAutocaptureEnabled()', () => {
    it('should return true by default', () => {
      expect(analytics.isAutocaptureEnabled('connect')).toBe(true);
      expect(analytics.isAutocaptureEnabled('disconnect')).toBe(true);
      expect(analytics.isAutocaptureEnabled('signature')).toBe(true);
      expect(analytics.isAutocaptureEnabled('transaction')).toBe(true);
      expect(analytics.isAutocaptureEnabled('chain')).toBe(true);
    });

    it('should return false when autocapture is disabled globally', async () => {
      const instance = await FormoAnalytics.init('key', { autocapture: false });

      expect(instance.isAutocaptureEnabled('connect')).toBe(false);
      expect(instance.isAutocaptureEnabled('transaction')).toBe(false);
    });

    it('should return false for specific disabled event types', async () => {
      const instance = await FormoAnalytics.init('key', {
        autocapture: {
          connect: true,
          disconnect: false,
          signature: true,
          transaction: false,
          chain: true,
        },
      });

      expect(instance.isAutocaptureEnabled('connect')).toBe(true);
      expect(instance.isAutocaptureEnabled('disconnect')).toBe(false);
      expect(instance.isAutocaptureEnabled('transaction')).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should clear currentUserId', () => {
      analytics.currentUserId = 'user-123';

      analytics.reset();

      expect(analytics.currentUserId).toBeUndefined();
    });

    it('should remove storage keys', () => {
      const mockRemove = storage().remove as jest.Mock;

      analytics.reset();

      expect(mockRemove).toHaveBeenCalled();
    });
  });

  describe('flush()', () => {
    it('should call eventQueue.flush()', async () => {
      const mockFlush = (analytics as any).eventQueue.flush;

      await analytics.flush();

      expect(mockFlush).toHaveBeenCalled();
    });
  });

  describe('cleanup()', () => {
    it('should call eventQueue.cleanup()', async () => {
      const mockCleanup = (analytics as any).eventQueue.cleanup;

      await analytics.cleanup();

      expect(mockCleanup).toHaveBeenCalled();
    });
  });
});
