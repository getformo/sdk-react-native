import {
  setConsentFlag,
  getConsentFlag,
  removeConsentFlag,
} from '../lib/consent';
import { storage } from '../lib/storage';

// Mock the storage module
jest.mock('../lib/storage', () => ({
  storage: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  })),
}));

describe('consent utilities', () => {
  let mockStorage: {
    get: jest.Mock;
    set: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    };
    (storage as jest.Mock).mockReturnValue(mockStorage);
  });

  describe('setConsentFlag()', () => {
    it('should set a consent flag in storage', () => {
      setConsentFlag('write-key', 'opt_out', 'true');

      expect(mockStorage.set).toHaveBeenCalledWith('consent_opt_out', 'true');
    });

    it('should handle different flag values', () => {
      setConsentFlag('write-key', 'tracking', 'false');

      expect(mockStorage.set).toHaveBeenCalledWith('consent_tracking', 'false');
    });

    it('should not throw when storage fails', () => {
      mockStorage.set.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => setConsentFlag('write-key', 'opt_out', 'true')).not.toThrow();
    });
  });

  describe('getConsentFlag()', () => {
    it('should get a consent flag from storage', () => {
      mockStorage.get.mockReturnValue('true');

      const result = getConsentFlag('write-key', 'opt_out');

      expect(mockStorage.get).toHaveBeenCalledWith('consent_opt_out');
      expect(result).toBe('true');
    });

    it('should return null when flag does not exist', () => {
      mockStorage.get.mockReturnValue(null);

      const result = getConsentFlag('write-key', 'opt_out');

      expect(result).toBeNull();
    });

    it('should return null when storage fails', () => {
      mockStorage.get.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = getConsentFlag('write-key', 'opt_out');

      expect(result).toBeNull();
    });
  });

  describe('removeConsentFlag()', () => {
    it('should remove a consent flag from storage', () => {
      removeConsentFlag('write-key', 'opt_out');

      expect(mockStorage.remove).toHaveBeenCalledWith('consent_opt_out');
    });

    it('should not throw when storage fails', () => {
      mockStorage.remove.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => removeConsentFlag('write-key', 'opt_out')).not.toThrow();
    });
  });

  describe('key generation', () => {
    it('should use consistent key format', () => {
      setConsentFlag('my-key', 'analytics', 'enabled');
      getConsentFlag('my-key', 'analytics');
      removeConsentFlag('my-key', 'analytics');

      // All operations should use the same key format
      expect(mockStorage.set).toHaveBeenCalledWith('consent_analytics', 'enabled');
      expect(mockStorage.get).toHaveBeenCalledWith('consent_analytics');
      expect(mockStorage.remove).toHaveBeenCalledWith('consent_analytics');
    });
  });
});
