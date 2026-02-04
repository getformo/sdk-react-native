import {
  isValidAddress,
  toChecksumAddress,
  getValidAddress,
  isBlockedAddress,
} from '../utils/address';

describe('address utilities', () => {
  describe('isValidAddress()', () => {
    it('should return true for valid lowercase address', () => {
      expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f3f6d2')).toBe(true);
    });

    it('should return true for valid uppercase address', () => {
      expect(isValidAddress('0x742D35CC6634C0532925A3B844BC9E7595F3F6D2')).toBe(true);
    });

    it('should return true for valid mixed case address', () => {
      expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595F3f6d2')).toBe(true);
    });

    it('should return false for address without 0x prefix', () => {
      expect(isValidAddress('742d35cc6634c0532925a3b844bc9e7595f3f6d2')).toBe(false);
    });

    it('should return false for address that is too short', () => {
      expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f3f6')).toBe(false);
    });

    it('should return false for address that is too long', () => {
      expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f3f6d2a')).toBe(false);
    });

    it('should return false for address with invalid characters', () => {
      expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f3f6gz')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidAddress('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isValidAddress(null as unknown as string)).toBe(false);
      expect(isValidAddress(undefined as unknown as string)).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isValidAddress(123 as unknown as string)).toBe(false);
      expect(isValidAddress({} as unknown as string)).toBe(false);
    });
  });

  describe('toChecksumAddress()', () => {
    it('should convert to EIP-55 checksum format', () => {
      const input = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
      const expected = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
      expect(toChecksumAddress(input)).toBe(expected);
    });

    it('should handle already checksummed address', () => {
      const checksummed = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
      expect(toChecksumAddress(checksummed)).toBe(checksummed);
    });

    it('should handle uppercase address', () => {
      const uppercase = '0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED';
      const expected = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
      expect(toChecksumAddress(uppercase)).toBe(expected);
    });

    it('should return invalid address unchanged', () => {
      const invalid = 'not-an-address';
      expect(toChecksumAddress(invalid)).toBe(invalid);
    });

    it('should handle zero address', () => {
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      expect(toChecksumAddress(zeroAddress)).toBe(zeroAddress);
    });

    it('should handle well-known addresses correctly', () => {
      // Vitalik's address (well-known checksum)
      const input = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
      const expected = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
      expect(toChecksumAddress(input)).toBe(expected);
    });
  });

  describe('getValidAddress()', () => {
    it('should return trimmed address for valid input', () => {
      const input = '  0x742d35cc6634c0532925a3b844bc9e7595f3f6d2  ';
      expect(getValidAddress(input)).toBe('0x742d35cc6634c0532925a3b844bc9e7595f3f6d2');
    });

    it('should return null for invalid address', () => {
      expect(getValidAddress('invalid')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(getValidAddress('')).toBeNull();
    });

    it('should return null for null', () => {
      expect(getValidAddress(null)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(getValidAddress(undefined)).toBeNull();
    });

    it('should return valid address without modification', () => {
      const valid = '0x742d35Cc6634C0532925a3b844Bc9e7595F3f6d2';
      expect(getValidAddress(valid)).toBe(valid);
    });
  });

  describe('isBlockedAddress()', () => {
    it('should return true for zero address', () => {
      expect(isBlockedAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    });

    it('should return true for dead address', () => {
      expect(isBlockedAddress('0x000000000000000000000000000000000000dead')).toBe(true);
    });

    it('should return true for blocked addresses regardless of case', () => {
      expect(isBlockedAddress('0x0000000000000000000000000000000000000000')).toBe(true);
      expect(isBlockedAddress('0x000000000000000000000000000000000000DEAD')).toBe(true);
    });

    it('should return false for normal addresses', () => {
      expect(isBlockedAddress('0x742d35cc6634c0532925a3b844bc9e7595f3f6d2')).toBe(false);
    });

    it('should return false for addresses similar to blocked ones', () => {
      expect(isBlockedAddress('0x0000000000000000000000000000000000000001')).toBe(false);
    });
  });
});
