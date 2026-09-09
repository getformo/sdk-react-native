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

    it('caps the set at 20 entries, dropping the oldest', () => {
      for (let i = 0; i < 21; i++) {
        session.markWalletDetected(`wallet.${i}`);
      }

      expect(session.isWalletDetected('wallet.0')).toBe(false);
      expect(session.isWalletDetected('wallet.1')).toBe(true);
      expect(session.isWalletDetected('wallet.20')).toBe(true);
      const stored = JSON.parse(mockStorage.set.mock.calls.at(-1)![1]) as string[];
      expect(stored).toHaveLength(20);
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

    it('identifies again when the user id changes', () => {
      session.markWalletIdentified(address, rdns, 'user-a');
      expect(session.isWalletIdentified(address, rdns, 'user-a')).toBe(true);
      expect(session.isWalletIdentified(address, rdns, 'user-b')).toBe(false);
    });

    it('dedupes the same user id', () => {
      session.markWalletIdentified(address, rdns, 'user-a');
      session.markWalletIdentified(address, rdns, 'user-a');
      expect(session.isWalletIdentified(address, rdns, 'user-a')).toBe(true);
      expect(mockStorage.set).toHaveBeenCalledTimes(2); // one write: set and timestamp
    });

    it('identifies again when the properties change', () => {
      session.markWalletIdentified(address, rdns, 'user-a', { plan: 'free' });
      expect(session.isWalletIdentified(address, rdns, 'user-a', { plan: 'free' })).toBe(true);
      expect(session.isWalletIdentified(address, rdns, 'user-a', { plan: 'pro' })).toBe(false);
    });

    it('dedupes properties whatever their key order', () => {
      session.markWalletIdentified(address, rdns, 'user-a', { plan: 'free', tier: 1 });
      expect(session.isWalletIdentified(address, rdns, 'user-a', { tier: 1, plan: 'free' })).toBe(true);
    });

    it('treats an empty properties object like none', () => {
      session.markWalletIdentified(address, rdns);
      expect(session.isWalletIdentified(address, rdns, undefined, {})).toBe(true);
    });

    it('keeps one entry per wallet-user, as on web', () => {
      session.markWalletIdentified(address, rdns, 'user-a');
      session.markWalletIdentified(address, rdns, 'user-b');

      // Both users stay identified on this wallet; a return to user-a is deduped.
      expect(session.isWalletIdentified(address, rdns, 'user-b')).toBe(true);
      expect(session.isWalletIdentified(address, rdns, 'user-a')).toBe(true);
      const stored = JSON.parse(mockStorage.set.mock.calls.at(-1)![1]) as string[];
      expect(stored).toHaveLength(2);
    });

    it('does not let a ":" in one user id match another wallet-user', () => {
      session.markWalletIdentified(address, rdns, 'a:b');
      session.markWalletIdentified(address, rdns, 'a');

      expect(session.isWalletIdentified(address, rdns, 'a:b')).toBe(true);
      expect(session.isWalletIdentified(address, rdns, 'a')).toBe(true);
    });

    it('keeps only the latest profile of a wallet-user', () => {
      session.markWalletIdentified(address, rdns, 'user-a', { plan: 'free' });
      session.markWalletIdentified(address, rdns, 'user-a', { plan: 'pro' });

      expect(session.isWalletIdentified(address, rdns, 'user-a', { plan: 'pro' })).toBe(true);
      // The last identify carried plan pro, so a return to free is a change again.
      expect(session.isWalletIdentified(address, rdns, 'user-a', { plan: 'free' })).toBe(false);
      const stored = JSON.parse(mockStorage.set.mock.calls.at(-1)![1]) as string[];
      expect(stored).toHaveLength(1);
    });

    it('caps the set at 20 entries, dropping the oldest', () => {
      for (let i = 0; i < 21; i++) {
        session.markWalletIdentified(`0x${String(i).padStart(40, '0')}`, rdns);
      }

      expect(session.isWalletIdentified(`0x${'0'.repeat(40)}`, rdns)).toBe(false);
      expect(session.isWalletIdentified(`0x${'1'.padStart(40, '0')}`, rdns)).toBe(true);
      expect(session.isWalletIdentified(`0x${'20'.padStart(40, '0')}`, rdns)).toBe(true);
      const stored = JSON.parse(mockStorage.set.mock.calls.at(-1)![1]) as string[];
      expect(stored).toHaveLength(20);
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

    it('should remove both sets and both timestamps from storage', () => {
      session.clear();
      expect(mockStorage.remove).toHaveBeenCalledTimes(4);
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_detected');
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_detected_at');
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_identified');
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_identified_at');
    });
  });

  describe('expiry', () => {
    const DAY = 24 * 60 * 60 * 1000;

    afterEach(() => {
      jest.useRealTimers();
    });

    it('renews the day on every write, so a later marker gets a full day', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      session.markWalletDetected('io.metamask');
      jest.setSystemTime(new Date('2026-09-09T23:00:00Z'));
      session.markWalletDetected('com.coinbase.wallet');

      jest.setSystemTime(new Date('2026-09-10T22:00:00Z'));

      expect(session.isWalletDetected('com.coinbase.wallet')).toBe(true);
      expect(session.isWalletDetected('io.metamask')).toBe(true);
    });

    it('stamps the first write and keeps markers within the day', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      session.markWalletDetected('io.metamask');
      expect(mockStorage.set).toHaveBeenCalledWith('wallet_detected_at', String(Date.now()));

      jest.setSystemTime(new Date('2026-09-09T23:00:00Z'));
      expect(session.isWalletDetected('io.metamask')).toBe(true);
    });

    it('does not renew the day for a marker that is already there', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      session.markWalletDetected('io.metamask');
      jest.setSystemTime(new Date('2026-09-09T12:00:00Z'));
      session.markWalletDetected('io.metamask');

      jest.setSystemTime(new Date('2026-09-10T06:00:00Z'));
      expect(session.isWalletDetected('io.metamask')).toBe(false);
    });

    it('forgets every marker a day after the write, in memory', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      session.markWalletDetected('io.metamask');
      session.markWalletIdentified('0x123', 'io.metamask');

      jest.setSystemTime(new Date('2026-09-10T00:00:01Z'));

      expect(session.isWalletDetected('io.metamask')).toBe(false);
      expect(session.isWalletIdentified('0x123', 'io.metamask')).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_detected_at');
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_identified_at');
    });

    it('expires each set from its own last write', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      session.markWalletDetected('io.metamask');
      jest.setSystemTime(new Date('2026-09-09T20:00:00Z'));
      session.markWalletIdentified('0x123', 'io.metamask');

      // The detect day ends; the identify write did not renew it.
      jest.setSystemTime(new Date('2026-09-10T01:00:00Z'));
      expect(session.isWalletDetected('io.metamask')).toBe(false);
      expect(session.isWalletIdentified('0x123', 'io.metamask')).toBe(true);
      expect(mockStorage.remove).not.toHaveBeenCalledWith('wallet_identified');

      // The identify day ends on its own clock.
      jest.setSystemTime(new Date('2026-09-10T20:00:01Z'));
      expect(session.isWalletIdentified('0x123', 'io.metamask')).toBe(false);
    });

    it('drops stale markers found in storage on load', () => {
      const stale = String(Date.now() - DAY - 1000);
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_detected_at') return stale;
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        return null;
      });

      const fresh = new FormoAnalyticsSession();

      expect(fresh.isWalletDetected('io.metamask')).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_detected');
    });

    it('drops only the stale set on load', () => {
      const stale = String(Date.now() - DAY - 1000);
      const recent = String(Date.now() - 1000);
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_detected_at') return stale;
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        if (key === 'wallet_identified_at') return recent;
        if (key === 'wallet_identified') return JSON.stringify(['0x123:io.metamask::']);
        return null;
      });

      const fresh = new FormoAnalyticsSession();

      expect(fresh.isWalletDetected('io.metamask')).toBe(false);
      expect(fresh.isWalletIdentified('0x123', 'io.metamask')).toBe(true);
    });

    it('keeps the shared legacy timestamp, so markers already past their day expire now', () => {
      const DAY = 24 * 60 * 60 * 1000;
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        if (key === 'wallet_marked_at') return String(Date.now() - DAY - 1000); // shared, stale
        return null;
      });

      const upgraded = new FormoAnalyticsSession();

      expect(upgraded.isWalletDetected('io.metamask')).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_marked_at');
      jest.useRealTimers();
    });

    it('stamps markers written by a version without per-set timestamps, so they expire too', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      const shared = Date.now() - 1000;
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        if (key === 'wallet_identified') return JSON.stringify(['0x123:io.metamask']);
        if (key === 'wallet_marked_at') return String(shared);
        return null; // no per-set timestamp: written before it existed
      });

      const upgraded = new FormoAnalyticsSession();

      // Each set keeps the shared timestamp, so its remaining day is unchanged.
      expect(mockStorage.set).toHaveBeenCalledWith('wallet_detected_at', String(shared));
      expect(mockStorage.set).toHaveBeenCalledWith('wallet_identified_at', String(shared));
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_marked_at');
      expect(upgraded.isWalletDetected('io.metamask')).toBe(true);
      expect(upgraded.isWalletIdentified('0x123', 'io.metamask')).toBe(true);
      jest.setSystemTime(new Date('2026-09-10T00:00:01Z'));
      expect(upgraded.isWalletDetected('io.metamask')).toBe(false);
      expect(upgraded.isWalletIdentified('0x123', 'io.metamask')).toBe(false);
    });

    it('keeps markers found in storage that are still within the day', () => {
      const recent = String(Date.now() - 1000);
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_detected_at') return recent;
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        return null;
      });

      const fresh = new FormoAnalyticsSession();

      expect(fresh.isWalletDetected('io.metamask')).toBe(true);
    });

    it('clamps a future timestamp to now on load', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      // Written while the clock was set to 2027, then the clock was corrected.
      const future = String(new Date('2027-01-01T00:00:00Z').getTime());
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_detected_at') return future;
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        return null;
      });

      const fresh = new FormoAnalyticsSession();

      expect(mockStorage.set).toHaveBeenCalledWith('wallet_detected_at', String(Date.now()));
      expect(fresh.isWalletDetected('io.metamask')).toBe(true);
      jest.setSystemTime(new Date('2026-09-10T00:00:01Z'));
      expect(fresh.isWalletDetected('io.metamask')).toBe(false);
    });

    it('clamps a timestamp the clock has moved behind, on check', () => {
      jest.useFakeTimers().setSystemTime(new Date('2027-01-01T00:00:00Z'));
      session.markWalletDetected('io.metamask');

      // The clock is corrected while the app runs.
      jest.setSystemTime(new Date('2026-09-09T00:00:00Z'));
      expect(session.isWalletDetected('io.metamask')).toBe(true);
      expect(mockStorage.set).toHaveBeenLastCalledWith('wallet_detected_at', String(Date.now()));

      jest.setSystemTime(new Date('2026-09-10T00:00:01Z'));
      expect(session.isWalletDetected('io.metamask')).toBe(false);
    });

    it('treats a non-finite timestamp as missing and stamps now', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_detected_at') return 'not-a-number';
        if (key === 'wallet_detected') return JSON.stringify(['io.metamask']);
        return null;
      });

      const fresh = new FormoAnalyticsSession();

      expect(mockStorage.set).toHaveBeenCalledWith('wallet_detected_at', String(Date.now()));
      expect(fresh.isWalletDetected('io.metamask')).toBe(true);
    });
  });

  describe('clearIdentified()', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('forgets identified wallets but keeps detected ones', () => {
      session.markWalletDetected('io.metamask');
      session.markWalletIdentified('0x123', 'io.metamask');

      session.clearIdentified();

      expect(session.isWalletDetected('io.metamask')).toBe(true);
      expect(session.isWalletIdentified('0x123', 'io.metamask')).toBe(false);
      expect(mockStorage.remove).toHaveBeenCalledTimes(2);
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_identified');
      expect(mockStorage.remove).toHaveBeenCalledWith('wallet_identified_at');
    });

    it('restarts the identify day, and leaves the detect day alone', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-09T00:00:00Z'));
      session.markWalletDetected('io.metamask');
      session.markWalletIdentified('0x123', 'io.metamask');

      session.clearIdentified();

      jest.setSystemTime(new Date('2026-09-09T23:00:00Z'));
      session.markWalletIdentified('0x123', 'io.metamask');
      jest.setSystemTime(new Date('2026-09-10T00:00:01Z'));
      expect(session.isWalletIdentified('0x123', 'io.metamask')).toBe(true); // a full day from its own write
      expect(session.isWalletDetected('io.metamask')).toBe(false); // the detect day was not renewed
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
        if (key === 'wallet_identified') {
          return JSON.stringify(['0x123:io.metamask::', '0x456:io.metamask:user-a:']);
        }
        return null;
      });

      const loadedSession = new FormoAnalyticsSession();

      expect(loadedSession.isWalletIdentified('0x123', 'io.metamask')).toBe(true);
      expect(loadedSession.isWalletIdentified('0x456', 'io.metamask', 'user-a')).toBe(true);
    });

    it('still matches keys written before the user id joined them', () => {
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_identified') {
          return JSON.stringify(['0x123:io.metamask']);
        }
        return null;
      });

      const loadedSession = new FormoAnalyticsSession();

      expect(loadedSession.isWalletIdentified('0x123', 'io.metamask')).toBe(true);
      expect(loadedSession.isWalletIdentified('0x123', 'io.metamask', 'user-a')).toBe(false);
    });

    it('keeps only the newest 20 entries of an oversized set', () => {
      const many = Array.from({ length: 25 }, (_, i) => `wallet.${i}`);
      mockStorage.get.mockImplementation((key: string) => {
        if (key === 'wallet_detected') return JSON.stringify(many);
        return null;
      });

      const loadedSession = new FormoAnalyticsSession();

      expect(loadedSession.isWalletDetected('wallet.4')).toBe(false);
      expect(loadedSession.isWalletDetected('wallet.5')).toBe(true);
      expect(loadedSession.isWalletDetected('wallet.24')).toBe(true);
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
