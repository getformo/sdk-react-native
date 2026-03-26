import { SignatureStatus, TransactionStatus } from '../types';

// Mock instances that persist across tests
const mockStorageInstance = {
  get: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
  isAvailable: jest.fn(),
};

const mockStorageManager = {
  initialize: jest.fn(),
  getPrimaryStorage: jest.fn(),
  getStorage: jest.fn(),
};

const mockEventManager = {
  addEvent: jest.fn(),
};

const mockEventQueue = {
  flush: jest.fn(),
  clear: jest.fn(),
  cleanup: jest.fn(),
};

const mockSession = {
  isWalletDetected: jest.fn(),
  isWalletIdentified: jest.fn(),
  markWalletDetected: jest.fn(),
  markWalletIdentified: jest.fn(),
  clear: jest.fn(),
};

// Mock dependencies
jest.mock('../lib/storage', () => ({
  __esModule: true,
  initStorageManager: jest.fn(),
  storage: jest.fn(),
  getStorageManager: jest.fn(),
}));

jest.mock('../lib/event', () => ({
  __esModule: true,
  EventManager: jest.fn(),
  EventQueue: jest.fn(),
}));

jest.mock('../lib/session', () => ({
  __esModule: true,
  FormoAnalyticsSession: jest.fn(),
}));

jest.mock('../lib/consent', () => ({
  __esModule: true,
  setConsentFlag: jest.fn(),
  getConsentFlag: jest.fn(),
  removeConsentFlag: jest.fn(),
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
  Logger: {
    init: jest.fn(),
  },
}));

// Import after mocking
import { FormoAnalytics } from '../FormoAnalytics';
import { initStorageManager, storage } from '../lib/storage';
import { EventManager, EventQueue } from '../lib/event';
import { FormoAnalyticsSession } from '../lib/session';
import { setConsentFlag, getConsentFlag, removeConsentFlag } from '../lib/consent';

// Helper to setup all mock implementations
const setupMocks = () => {
  // Storage mocks
  mockStorageInstance.get.mockReturnValue(null);
  mockStorageInstance.set.mockReturnValue(undefined);
  mockStorageInstance.remove.mockReturnValue(undefined);
  mockStorageInstance.isAvailable.mockReturnValue(true);

  mockStorageManager.initialize.mockResolvedValue(undefined);
  mockStorageManager.getPrimaryStorage.mockReturnValue(mockStorageInstance);
  mockStorageManager.getStorage.mockReturnValue(mockStorageInstance);

  (initStorageManager as jest.Mock).mockReturnValue(mockStorageManager);
  (storage as jest.Mock).mockReturnValue(mockStorageInstance);

  // Event mocks
  mockEventManager.addEvent.mockResolvedValue(undefined);
  mockEventQueue.flush.mockResolvedValue(undefined);
  mockEventQueue.clear.mockReturnValue(undefined);
  mockEventQueue.cleanup.mockResolvedValue(undefined);

  (EventManager as jest.Mock).mockImplementation(() => mockEventManager);
  (EventQueue as jest.Mock).mockImplementation(() => mockEventQueue);

  // Session mocks
  mockSession.isWalletDetected.mockReturnValue(false);
  mockSession.isWalletIdentified.mockReturnValue(false);
  mockSession.markWalletDetected.mockReturnValue(undefined);
  mockSession.markWalletIdentified.mockReturnValue(undefined);
  mockSession.clear.mockReturnValue(undefined);

  (FormoAnalyticsSession as jest.Mock).mockImplementation(() => mockSession);

  // Consent mocks
  (getConsentFlag as jest.Mock).mockReturnValue(null);
};

describe('FormoAnalytics', () => {
  let analytics: FormoAnalytics;
  const writeKey = 'test-write-key';

  beforeEach(async () => {
    // Re-setup mock implementations after clearMocks
    setupMocks();
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

      await FormoAnalytics.init('my-key', {}, mockAsyncStorage as any);

      expect(mockStorageManager.initialize).toHaveBeenCalledWith(mockAsyncStorage);
    });
  });

  describe('connect()', () => {
    it('should not track if chainId is null', async () => {
      await analytics.connect({ chainId: null as any, address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2' });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if chainId is 0', async () => {
      await analytics.connect({ chainId: 0, address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2' });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if address is empty', async () => {
      await analytics.connect({ chainId: 1, address: '' });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if address is invalid', async () => {
      await analytics.connect({ chainId: 1, address: 'invalid-address' });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should track valid connect event', async () => {
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
      await analytics.chain({ chainId: 0 });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if chainId is invalid', async () => {
      await analytics.chain({ chainId: NaN });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if no address is available', async () => {
      analytics.currentAddress = undefined;

      await analytics.chain({ chainId: 137 });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should track valid chain change event', async () => {
      await analytics.chain({ chainId: 137 });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });

    it('should update currentChainId after chain change', async () => {
      await analytics.chain({ chainId: 137 });

      expect(analytics.currentChainId).toBe(137);
    });
  });

  describe('signature()', () => {
    it('should track signature with chainId 0 (chainId is optional)', async () => {
      await analytics.signature({
        status: SignatureStatus.REQUESTED,
        chainId: 0,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
        message: 'test message',
      });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });

    it('should track signature without chainId', async () => {
      await analytics.signature({
        status: SignatureStatus.REQUESTED,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
        message: 'test message',
      });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });

    it('should not track if address is empty', async () => {
      await analytics.signature({
        status: SignatureStatus.REQUESTED,
        chainId: 1,
        address: '',
        message: 'test message',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should track valid signature event', async () => {
      await analytics.signature({
        status: SignatureStatus.CONFIRMED,
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
      await analytics.transaction({
        status: TransactionStatus.STARTED,
        chainId: 0,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not track if address is empty', async () => {
      await analytics.transaction({
        status: TransactionStatus.STARTED,
        chainId: 1,
        address: '',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should track valid transaction event', async () => {
      await analytics.transaction({
        status: TransactionStatus.CONFIRMED,
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
      await analytics.track('button_click', { button_id: 'submit' });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });
  });

  describe('screen()', () => {
    it('should track screen views', async () => {
      await analytics.screen('HomeScreen', undefined, { section: 'featured' });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });
  });

  describe('opt-out tracking', () => {
    it('should return false for hasOptedOutTracking by default', () => {
      expect(analytics.hasOptedOutTracking()).toBe(false);
    });

    it('should set opt-out flag when optOutTracking is called', async () => {
      analytics.optOutTracking();

      expect(setConsentFlag).toHaveBeenCalled();
    });

    it('should remove opt-out flag when optInTracking is called', () => {
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
      analytics.reset();

      expect(mockStorageInstance.remove).toHaveBeenCalled();
    });
  });

  describe('flush()', () => {
    it('should call eventQueue.flush()', async () => {
      await analytics.flush();

      expect(mockEventQueue.flush).toHaveBeenCalled();
    });
  });

  describe('cleanup()', () => {
    it('should call eventQueue.cleanup()', async () => {
      await analytics.cleanup();

      expect(mockEventQueue.cleanup).toHaveBeenCalled();
    });
  });
});
