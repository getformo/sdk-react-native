import { FormoAnalyticsSession } from '../lib/session';
import { storage } from '../lib/storage';

// Mock the storage module
jest.mock('../lib/storage', () => ({
  storage: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  })),
}));

describe('FormoAnalyticsSession', () => {
  let session: FormoAnalyticsSession;
  let mockStorage: {
    get: jest.Mock;
    set: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    mockStorage = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
      remove: jest.fn(),
    };
    (storage as jest.Mock).mockReturnValue(mockStorage);
    session = new FormoAnalyticsSession();
  });

  describe('wallet detection', () => {
    it('should return false for undetected wallet', () => {
      expect(session.isWalletDetected('io.metamask')).toBe(false);
    });

    it('should return true after marking wallet as detected', () => {
      session.markWalletDetected('io.metamask');
      expect(session.isWalletDetected('io.metamask')).toBe(true);
    });

    it('should track multiple wallets independently', () => {
      session.markWalletDetected('io.metamask');
      session.markWalletDetected('com.coinbase.wallet');

      expect(session.isWalletDetected('io.metamask')).toBe(true);
      expect(session.isWalletDetected('com.coinbase.wallet')).toBe(true);
      expect(session.isWalletDetected('com.phantom')).toBe(false);
    });

    it('should save to storage when marking detected', () => {
      session.markWalletDetected('io.metamask');
      expect(mockStorage.set).toHaveBeenCalled();
    });
  });

  describe('wallet identification', () => {
    const address = '0x742d35cc6634c0532925a3b844bc9e7595f3f6d2';
    const rdns = 'io.metamask';

    it('should return false for unidentified wallet', () => {
      expect(session.isWalletIdentified(address, rdns)).toBe(false);
    });

    it('should return true after marking wallet as identified', () => {
      session.markWalletIdentified(address, rdns);
      expect(session.isWalletIdentified(address, rdns)).toBe(true);
    });

    it('should be case insensitive for addresses', () => {
      session.markWalletIdentified(address.toLowerCase(), rdns);
      expect(session.isWalletIdentified(address.toUpperCase(), rdns)).toBe(true);
    });

    it('should track different address+rdns combinations independently', () => {
      const address2 = '0x1234567890123456789012345678901234567890';

      session.markWalletIdentified(address, rdns);
      session.markWalletIdentified(address2, 'com.coinbase.wallet');

      expect(session.isWalletIdentified(address, rdns)).toBe(true);
      expect(session.isWalletIdentified(address2, 'com.coinbase.wallet')).toBe(true);
      expect(session.isWalletIdentified(address, 'com.coinbase.wallet')).toBe(false);
      expect(session.isWalletIdentified(address2, rdns)).toBe(false);
    });

    it('should save to storage when marking identified', () => {
      session.markWalletIdentified(address, rdns);
      expect(mockStorage.set).toHaveBeenCalled();
    });
  });

  describe('clear()', () => {
    it('should clear all detected and identified wallets', () => {
      session.markWalletDetected('io.metamask');
      session.markWalletIdentified('0x123', 'io.metamask');

      session.clear();

      expect(session.isWalletDetected('io.metamask')).toBe(false);
      expect(session.isWalletIdentified('0x123', 'io.metamask')).toBe(false);
    });

    it('should remove from storage when clearing', () => {
      session.clear();
      expect(mockStorage.remove).toHaveBeenCalledTimes(3);
    });
  });

  describe('expiry', () => {
    const DAY = 24 * 60 * 60 * 1000;

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stamps the first write and keeps markers within the day', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      session.markWalletDetected('io.metamask');
      expect(mockStorage.set).toHaveBeenCalledWith('wallet_marked_at', String(Date.now()));

      jest.setSystemTime(new Date('2026-09-09T23:00:00Z'));
      expect(session.isWalletDetected('io.metamask')).toBe(true);
    });

    it('forgets every marker a day after the first write, in memory', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      session.markWalletDetected('io.metamask');
      session.markWalletIdentified('0x123', 'io.metamask');

      jest.setSystemTime(new Date('2026-09-10T00:00:01Z'));

      expect(session.isWalletDetected('io.metamask')).toBe(false);
      expect(session.isWalletIdentified('0x123', 'io.metamask')).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_marked_at');
    });

    it('drops stale markers found in storage on load', () => {
      const stale = String(Date.now() - DAY - 1000);
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_marked_at') return stale;
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        return null;
      });

      const fresh = new FormoAnalyticsSession();

      expect(fresh.isWalletDetected('io.metamask')).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_detected');
    });

    it('keeps markers found in storage that are still within the day', () => {
      const recent = String(Date.now() - 1000);
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_marked_at') return recent;
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        return null;
      });

      const fresh = new FormoAnalyticsSession();

      expect(fresh.isWalletDetected('io.metamask')).toBe(true);
    });
  });

  describe('clearIdentified()', () => {
    it('forgets identified wallets but keeps detected ones', () => {
      session.markWalletDetected('io.metamask');
      session.markWalletIdentified('0x123', 'io.metamask');

      session.clearIdentified();

      expect(session.isWalletDetected('io.metamask')).toBe(true);
      expect(session.isWalletIdentified('0x123', 'io.metamask')).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading from storage', () => {
    it('should load detected wallets from storage', () => {
      mockStorage.get.mockImplementation((key: string) => {
        if (key.includes('detected')) {
          return JSON.stringify(['io.metamask', 'com.coinbase.wallet']);
        }
        return null;
      });

      const loadedSession = new FormoAnalyticsSession();

      expect(loadedSession.isWalletDetected('io.metamask')).toBe(true);
      expect(loadedSession.isWalletDetected('com.coinbase.wallet')).toBe(true);
    });

    it('should load identified wallets from storage', () => {
      mockStorage.get.mockImplementation((key: string) => {
        if (key.includes('identified')) {
          return JSON.stringify(['0x123:io.metamask']);
        }
        return null;
      });

      const loadedSession = new FormoAnalyticsSession();

      expect(loadedSession.isWalletIdentified('0x123', 'io.metamask')).toBe(true);
    });

    it('should handle invalid JSON in storage gracefully', () => {
      mockStorage.get.mockReturnValue('invalid json');

      expect(() => new FormoAnalyticsSession()).not.toThrow();
    });

    it('should handle empty storage', () => {
      mockStorage.get.mockReturnValue(null);

      const loadedSession = new FormoAnalyticsSession();

      expect(loadedSession.isWalletDetected('anything')).toBe(false);
    });
  });
});
