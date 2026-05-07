import {
  isSolanaAddress,
  getValidSolanaAddress,
  isBlockedSolanaAddress,
  isSolanaSystemAddress,
  SOLANA_SYSTEM_ADDRESSES,
} from '../solana/address';
import {
  isSolanaChainId,
  SOLANA_CHAIN_IDS,
  DEFAULT_SOLANA_CHAIN_ID,
} from '../solana/types';
import {
  validateAddress,
  isBlockedAddress,
} from '../utils/address';

const VITALIK_EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const VITALIK_EVM_CHECKSUM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

// A real Solana address (Vitalik example replaced with valid Base58 32-byte key)
const VALID_SOLANA = 'FDKJvWcJNe6wecbgDYDFPCfgs14aJnVsUfWQRYWLn4Tn';
const ANOTHER_SOLANA = '7v91N7iZ9eyTktonbRy7sTjKBNMWFM8jShaeP4S2t9NA';

describe('Solana address utilities', () => {
  describe('isSolanaAddress()', () => {
    it('returns true for a valid Base58 32-byte key', () => {
      expect(isSolanaAddress(VALID_SOLANA)).toBe(true);
      expect(isSolanaAddress(ANOTHER_SOLANA)).toBe(true);
    });

    it('returns true for system addresses', () => {
      expect(isSolanaAddress(SOLANA_SYSTEM_ADDRESSES.SYSTEM_PROGRAM)).toBe(true);
      expect(isSolanaAddress(SOLANA_SYSTEM_ADDRESSES.TOKEN_PROGRAM)).toBe(true);
    });

    it('returns false for too-short strings', () => {
      expect(isSolanaAddress('abc')).toBe(false);
    });

    it('returns false for too-long strings', () => {
      expect(isSolanaAddress('1'.repeat(45))).toBe(false);
    });

    it('returns false for strings containing non-Base58 characters', () => {
      // 0 (zero), O (capital o), I (capital i), l (lower L) are not in Base58
      expect(isSolanaAddress('0OIl' + '1'.repeat(28))).toBe(false);
    });

    it('returns false for EVM addresses', () => {
      expect(isSolanaAddress(VITALIK_EVM)).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isSolanaAddress(null)).toBe(false);
      expect(isSolanaAddress(undefined)).toBe(false);
      expect(isSolanaAddress(123)).toBe(false);
      expect(isSolanaAddress({})).toBe(false);
    });
  });

  describe('getValidSolanaAddress()', () => {
    it('trims whitespace and returns the address', () => {
      expect(getValidSolanaAddress(`  ${VALID_SOLANA}  `)).toBe(VALID_SOLANA);
    });

    it('returns null for invalid addresses', () => {
      expect(getValidSolanaAddress('invalid')).toBeNull();
      expect(getValidSolanaAddress('')).toBeNull();
      expect(getValidSolanaAddress(null)).toBeNull();
      expect(getValidSolanaAddress(undefined)).toBeNull();
    });

    it('handles PublicKey-like objects with toBase58', () => {
      const pk = {
        toBase58: () => VALID_SOLANA,
        toString: () => VALID_SOLANA,
        toBytes: () => new Uint8Array(),
        equals: () => false,
      };
      expect(getValidSolanaAddress(pk)).toBe(VALID_SOLANA);
    });

    it('returns null when toBase58 throws', () => {
      const pk = {
        toBase58: () => {
          throw new Error('boom');
        },
        toString: () => '',
        toBytes: () => new Uint8Array(),
        equals: () => false,
      };
      expect(getValidSolanaAddress(pk)).toBeNull();
    });
  });

  describe('isSolanaSystemAddress() / isBlockedSolanaAddress()', () => {
    it('returns true for system program', () => {
      expect(isSolanaSystemAddress(SOLANA_SYSTEM_ADDRESSES.SYSTEM_PROGRAM)).toBe(true);
      expect(isBlockedSolanaAddress(SOLANA_SYSTEM_ADDRESSES.SYSTEM_PROGRAM)).toBe(true);
    });

    it('returns false for normal user addresses', () => {
      expect(isSolanaSystemAddress(VALID_SOLANA)).toBe(false);
      expect(isBlockedSolanaAddress(VALID_SOLANA)).toBe(false);
    });
  });

  describe('isSolanaChainId()', () => {
    it('returns true for known Solana chain IDs', () => {
      expect(isSolanaChainId(SOLANA_CHAIN_IDS['mainnet-beta'])).toBe(true);
      expect(isSolanaChainId(SOLANA_CHAIN_IDS.devnet)).toBe(true);
      expect(isSolanaChainId(DEFAULT_SOLANA_CHAIN_ID)).toBe(true);
    });

    it('returns false for EVM chain IDs', () => {
      expect(isSolanaChainId(1)).toBe(false);
      expect(isSolanaChainId(137)).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isSolanaChainId(null)).toBe(false);
      expect(isSolanaChainId(undefined)).toBe(false);
    });
  });
});

describe('validateAddress()', () => {
  it('returns checksummed EVM address when no chainId is provided', () => {
    expect(validateAddress(VITALIK_EVM)).toBe(VITALIK_EVM_CHECKSUM);
  });

  it('returns Solana address as-is when no chainId is provided', () => {
    expect(validateAddress(VALID_SOLANA)).toBe(VALID_SOLANA);
  });

  it('returns checksummed EVM address for EVM chainId', () => {
    expect(validateAddress(VITALIK_EVM, 1)).toBe(VITALIK_EVM_CHECKSUM);
  });

  it('returns undefined for Solana address with EVM chainId', () => {
    expect(validateAddress(VALID_SOLANA, 1)).toBeUndefined();
  });

  it('returns Solana address for Solana chainId', () => {
    expect(validateAddress(VALID_SOLANA, DEFAULT_SOLANA_CHAIN_ID)).toBe(
      VALID_SOLANA
    );
  });

  it('returns undefined for EVM address with Solana chainId', () => {
    expect(validateAddress(VITALIK_EVM, DEFAULT_SOLANA_CHAIN_ID)).toBeUndefined();
  });

  it('returns undefined for invalid input', () => {
    expect(validateAddress('not-an-address')).toBeUndefined();
    expect(validateAddress('')).toBeUndefined();
  });
});

describe('isBlockedAddress() with Solana', () => {
  it('returns false for normal Solana addresses', () => {
    expect(isBlockedAddress(VALID_SOLANA)).toBe(false);
  });

  it('returns true for Solana system program', () => {
    expect(isBlockedAddress(SOLANA_SYSTEM_ADDRESSES.SYSTEM_PROGRAM)).toBe(true);
    expect(isBlockedAddress(SOLANA_SYSTEM_ADDRESSES.TOKEN_PROGRAM)).toBe(true);
  });

  it('still returns true for EVM zero/dead addresses', () => {
    expect(
      isBlockedAddress('0x0000000000000000000000000000000000000000')
    ).toBe(true);
    expect(
      isBlockedAddress('0x000000000000000000000000000000000000dead')
    ).toBe(true);
  });
});
