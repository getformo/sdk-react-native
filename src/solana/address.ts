/**
 * Solana address validation utilities
 *
 * Solana uses Base58 encoded 32-byte public keys as addresses.
 * Format: FDKJvWcJNe6wecbgDYDFPCfgs14aJnVsUfWQRYWLn4Tn (32-44 characters)
 *
 * @see https://solana.com/developers/courses/intro-to-solana/interact-with-wallets
 */

import { SolanaPublicKey } from "./types";

/**
 * Base58 alphabet used by Solana (Bitcoin alphabet)
 */
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const BASE58_CHAR_SET = new Set(BASE58_ALPHABET);

const MIN_SOLANA_ADDRESS_LENGTH = 32;
const MAX_SOLANA_ADDRESS_LENGTH = 44;

/**
 * System program addresses and other special Solana addresses
 * These are valid addresses but may not represent user wallets
 */
export const SOLANA_SYSTEM_ADDRESSES = {
  SYSTEM_PROGRAM: "11111111111111111111111111111111",
  TOKEN_PROGRAM: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  TOKEN_2022_PROGRAM: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  ASSOCIATED_TOKEN_PROGRAM: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  RENT_SYSVAR: "SysvarRent111111111111111111111111111111111",
  CLOCK_SYSVAR: "SysvarC1ock11111111111111111111111111111111",
} as const;

function isValidBase58String(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === undefined || !BASE58_CHAR_SET.has(ch)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a string is a valid Solana address format
 *
 * Performs format validation only (length and character set). Does not
 * verify that the address is a valid point on the Ed25519 curve.
 */
export function isSolanaAddress(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();

  if (
    trimmed.length < MIN_SOLANA_ADDRESS_LENGTH ||
    trimmed.length > MAX_SOLANA_ADDRESS_LENGTH
  ) {
    return false;
  }

  return isValidBase58String(trimmed);
}

/**
 * Get a valid Solana address from a string or PublicKey
 */
export function getValidSolanaAddress(
  address: string | SolanaPublicKey | null | undefined
): string | null {
  if (!address) {
    return null;
  }

  if (typeof address === "object" && "toBase58" in address) {
    try {
      const base58 = address.toBase58();
      return isSolanaAddress(base58) ? base58 : null;
    } catch {
      return null;
    }
  }

  if (typeof address === "string") {
    const trimmed = address.trim();
    return isSolanaAddress(trimmed) ? trimmed : null;
  }

  return null;
}

/**
 * Check if a Solana address is a system program or well-known program address
 */
export function isSolanaSystemAddress(address: string): boolean {
  const validAddress = getValidSolanaAddress(address);
  if (!validAddress) {
    return false;
  }

  return Object.values(SOLANA_SYSTEM_ADDRESSES).includes(
    validAddress as (typeof SOLANA_SYSTEM_ADDRESSES)[keyof typeof SOLANA_SYSTEM_ADDRESSES]
  );
}

/**
 * Check if a Solana address is blocked (should not emit events).
 * Blocks system program addresses since they don't represent user wallets.
 */
export function isBlockedSolanaAddress(
  address: string | SolanaPublicKey | null | undefined
): boolean {
  const validAddress = getValidSolanaAddress(address);
  if (!validAddress) {
    return false;
  }

  return isSolanaSystemAddress(validAddress);
}
