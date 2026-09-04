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

const mockLifecycleManager = {
  start: jest.fn(),
  cleanup: jest.fn(),
};

jest.mock('../lib/lifecycle', () => ({
  __esModule: true,
  AppLifecycleManager: jest.fn(),
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
import { AppLifecycleManager } from '../lib/lifecycle';

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

  // Lifecycle mocks
  mockLifecycleManager.start.mockResolvedValue(undefined);
  mockLifecycleManager.cleanup.mockReturnValue(undefined);
  (AppLifecycleManager as jest.Mock).mockImplementation(() => mockLifecycleManager);
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

    it('should not restore wallet state after reset while connect is pending', async () => {
      let finish!: () => void;
      mockEventManager.addEvent.mockReturnValueOnce(
        new Promise<void>((resolve) => { finish = resolve; })
      );

      const pending = analytics.connect({
        chainId: 1,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
      });
      analytics.reset();
      finish();
      await pending;

      expect(analytics.currentAddress).toBeUndefined();
      expect(analytics.currentChainId).toBeUndefined();
    });

    it('should not learn wallet state while opted out', async () => {
      (getConsentFlag as jest.Mock).mockReturnValue('true');

      await analytics.connect({
        chainId: 1,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
      });

      expect(analytics.currentAddress).toBeUndefined();
      expect(analytics.currentChainId).toBeUndefined();
      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
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

    it('should not restore chain state after reset while a change is pending', async () => {
      let finish!: () => void;
      mockEventManager.addEvent.mockReturnValueOnce(
        new Promise<void>((resolve) => { finish = resolve; })
      );

      const pending = analytics.chain({ chainId: 137 });
      analytics.reset();
      finish();
      await pending;

      expect(analytics.currentChainId).toBeUndefined();
    });

    it('should retain the address when a chain change overtakes connect', async () => {
      let finishConnect!: () => void;
      mockEventManager.addEvent.mockReturnValueOnce(
        new Promise<void>((resolve) => { finishConnect = resolve; })
      );
      analytics.currentAddress = undefined;
      analytics.currentChainId = undefined;
      const address = '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2';

      const pendingConnect = analytics.connect({ chainId: 1, address });
      await analytics.chain({ chainId: 137, address });
      finishConnect();
      await pendingConnect;

      expect((analytics.currentAddress as string | undefined)?.toLowerCase()).toBe(
        address.toLowerCase()
      );
      expect(analytics.currentChainId).toBe(137);
    });

    it('should retain a pending chain assignment across identify', async () => {
      let finishChain!: () => void;
      mockEventManager.addEvent.mockReturnValueOnce(
        new Promise<void>((resolve) => { finishChain = resolve; })
      );
      analytics.currentAddress = undefined;
      analytics.currentChainId = undefined;
      const address = '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2';

      const pendingChain = analytics.chain({ chainId: 137, address });
      await analytics.identify({ address });
      finishChain();
      await pendingChain;

      expect(analytics.currentChainId).toBe(137);
    });

    it('should reject an invalid address before updating chain state', async () => {
      await analytics.chain({ chainId: 137, address: 'not-an-address' });

      expect(analytics.currentAddress).toBe(
        '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2'
      );
      expect(analytics.currentChainId).toBe(1);
      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
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

    it('should treat chainId 0 as unscoped for exclusions', async () => {
      analytics.options.tracking = { excludeChains: [1] };
      analytics.currentChainId = 1;

      await analytics.signature({
        status: SignatureStatus.REQUESTED,
        chainId: 0,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
        message: 'test message',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
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
      });

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });

    it('never forwards a signatureHash to the event pipeline', async () => {
      await analytics.signature({
        status: SignatureStatus.CONFIRMED,
        chainId: 1,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
        message: 'test message',
        // signatureHash was removed from the API; a caller forcing it in
        // must never reach the emitted event.
        signatureHash: '0x' + 'a'.repeat(130),
      } as any);

      expect(mockEventManager.addEvent).toHaveBeenCalled();
      const emitted = mockEventManager.addEvent.mock.calls[0][0];
      expect(emitted).not.toHaveProperty('signatureHash');
      expect(JSON.stringify(emitted)).not.toContain('a'.repeat(130));
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

  describe('method binding', () => {
    // useFormo consumers destructure methods off the instance
    // (const { reset } = useFormo()), so every public interface method must
    // be bound in the constructor or `this` is undefined at the call site.
    const publicMethods = [
      'identify',
      'connect',
      'disconnect',
      'chain',
      'signature',
      'transaction',
      'detect',
      'track',
      'screen',
      'reset',
      'cleanup',
      'flush',
      'setTrafficSourceFromUrl',
      'optOutTracking',
      'optInTracking',
      'hasOptedOutTracking',
      'pushNotificationReceived',
      'pushNotificationTapped',
      'pushNotificationBounced',
      'isAutocaptureEnabled',
      'isAttributionEnabled',
    ] as const;

    it.each(publicMethods)('binds %s to the instance', (name) => {
      expect(Object.prototype.hasOwnProperty.call(analytics, name)).toBe(true);
      expect(analytics[name]).not.toBe(FormoAnalytics.prototype[name]);
    });

    it('reset works when destructured off the instance', () => {
      analytics.currentUserId = 'user-1';

      const { reset } = analytics;

      expect(() => reset()).not.toThrow();
      expect(mockSession.clear).toHaveBeenCalled();
      expect(analytics.currentUserId).toBeUndefined();
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

    // `foregrounded` and `crashes` invert the default. Turning either on
    // silently would change an existing app's behavior on a version bump:
    // foregrounded doubles foreground event volume, and crashes installs a
    // global JS error handler.
    it.each(['foregrounded', 'crashes'] as const)(
      'keeps %s off by default',
      (option) => {
        expect(analytics.isAutocaptureEnabled(option)).toBe(false);
      },
    );

    it.each(['foregrounded', 'crashes'] as const)(
      'keeps %s off even when autocapture is globally true',
      async (option) => {
        // `autocapture: true` means "the usual set", not "everything".
        const instance = await FormoAnalytics.init('key', { autocapture: true });

        expect(instance.isAutocaptureEnabled(option)).toBe(false);
        expect(instance.isAutocaptureEnabled('connect')).toBe(true);
      },
    );

    it.each(['foregrounded', 'crashes'] as const)(
      'enables %s only when named explicitly',
      async (option) => {
        const instance = await FormoAnalytics.init('key', {
          autocapture: { [option]: true },
        });

        expect(instance.isAutocaptureEnabled(option)).toBe(true);
      },
    );

    it('keeps deepLinks on by default and honours an explicit false', async () => {
      expect(analytics.isAutocaptureEnabled('deepLinks')).toBe(true);

      const instance = await FormoAnalytics.init('key', {
        autocapture: { deepLinks: false },
      });
      expect(instance.isAutocaptureEnabled('deepLinks')).toBe(false);
    });

    it('disables the opt-in behaviors when autocapture is globally false', async () => {
      const instance = await FormoAnalytics.init('key', { autocapture: false });

      expect(instance.isAutocaptureEnabled('foregrounded')).toBe(false);
      expect(instance.isAutocaptureEnabled('crashes')).toBe(false);
      expect(instance.isAutocaptureEnabled('deepLinks')).toBe(false);
    });
  });

  describe('push notification events', () => {
    // Push delivery is invisible to JS without a native module, so these are
    // explicit calls rather than autocapture. They must emit the exact
    // Segment-spec names — that is what makes them recognisable downstream.
    it.each([
      ['pushNotificationReceived', 'Push Notification Received'],
      ['pushNotificationTapped', 'Push Notification Tapped'],
      ['pushNotificationBounced', 'Push Notification Bounced'],
    ] as const)('%s emits "%s"', async (method, eventName) => {
      const trackSpy = jest.spyOn(analytics, 'track').mockResolvedValue();

      await analytics[method]({ campaign_id: 'c1' });

      expect(trackSpy).toHaveBeenCalledWith(eventName, { campaign_id: 'c1' });
      trackSpy.mockRestore();
    });

    it('accepts no properties', async () => {
      const trackSpy = jest.spyOn(analytics, 'track').mockResolvedValue();

      await analytics.pushNotificationTapped();

      expect(trackSpy).toHaveBeenCalledWith('Push Notification Tapped', undefined);
      trackSpy.mockRestore();
    });
  });

  describe('reset()', () => {
    it('should clear currentUserId', () => {
      analytics.currentUserId = 'user-123';

      analytics.reset();

      expect(analytics.currentUserId).toBeUndefined();
    });

    it('should clear the active wallet', () => {
      analytics.currentAddress = '0x51377e9B985Bb90B7c091B9a7d30C93d4c9c1CEf';
      analytics.currentChainId = 1;

      analytics.reset();

      expect(analytics.currentAddress).toBeUndefined();
      expect(analytics.currentChainId).toBeUndefined();
    });

    it('should start a new session but keep the anonymous id', () => {
      analytics.reset();

      expect(mockStorageInstance.remove).toHaveBeenCalledWith('session_id');
      expect(mockStorageInstance.remove).not.toHaveBeenCalledWith('anonymous_id');
    });

    it('should filter chain-scoped events after reset', async () => {
      analytics.options.tracking = { excludeChains: [1] };
      analytics.reset();

      await analytics.transaction({
        status: TransactionStatus.STARTED,
        chainId: 1,
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
      });

      expect(mockEventManager.addEvent).not.toHaveBeenCalled();
    });

    it('should not bind unscoped events to the cleared chain', async () => {
      analytics.options.tracking = { excludeChains: [1] };
      analytics.currentChainId = 1;
      analytics.reset();

      await analytics.track('after reset');

      expect(mockEventManager.addEvent).toHaveBeenCalled();
    });
  });

  describe('optOutTracking()', () => {
    it('should clear the anonymous id and the stored attribution as well', () => {
      analytics.optOutTracking();

      expect(mockStorageInstance.remove).toHaveBeenCalledWith('anonymous_id');
      expect(mockStorageInstance.remove).toHaveBeenCalledWith('traffic_source');
    });

    it('reset() alone keeps the stored attribution', () => {
      analytics.reset();

      expect(mockStorageInstance.remove).not.toHaveBeenCalledWith('traffic_source');
    });

    it('does not store attribution while opted out', () => {
      (getConsentFlag as jest.Mock).mockReturnValue('true');

      analytics.setTrafficSourceFromUrl('myapp://home?utm_source=test');

      expect(mockStorageInstance.set).not.toHaveBeenCalledWith(
        'traffic_source',
        expect.anything()
      );
    });

    it('does not learn identity markers while opted out', async () => {
      (getConsentFlag as jest.Mock).mockReturnValue('true');

      await analytics.identify({
        address: '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2',
      });
      await analytics.detect({ providerName: 'MetaMask', rdns: 'io.metamask' });

      expect(analytics.currentAddress).toBeUndefined();
      expect(mockSession.markWalletIdentified).not.toHaveBeenCalled();
      expect(mockSession.markWalletDetected).not.toHaveBeenCalled();
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
