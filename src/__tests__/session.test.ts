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
      expect(mockStorage.remove).toHaveBeenCalledTimes(2);
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
