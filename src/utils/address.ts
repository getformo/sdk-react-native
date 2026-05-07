/**
 * Address validation and checksum utilities
 *
 * Supports both EVM and Solana addresses.
 *
 * Uses ethereum-cryptography for proper EIP-55 checksum computation.
 */

import { keccak256 } from "ethereum-cryptography/keccak.js";
import { utf8ToBytes } from "ethereum-cryptography/utils.js";
import {
  isSolanaAddress,
  getValidSolanaAddress,
  isBlockedSolanaAddress,
} from "../solana/address";
import { isSolanaChainId } from "../solana/types";

/**
 * Convert Uint8Array to hex string
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Check if a string is a valid Ethereum (EVM) address
 */
export function isValidAddress(address: string): boolean {
  if (!address) return false;
  if (typeof address !== "string") return false;

  // Check if it matches basic hex address format
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Convert address to EIP-55 checksum format
 *
 * Uses keccak256 from ethereum-cryptography for correct checksumming
 * See: https://eips.ethereum.org/EIPS/eip-55
 */
export function toChecksumAddress(address: string): string {
  if (!isValidAddress(address)) {
    return address;
  }

  const lowercaseAddress = address.toLowerCase().replace("0x", "");
  const hash = toHex(keccak256(utf8ToBytes(lowercaseAddress)));

  let checksumAddress = "0x";

  for (let i = 0; i < lowercaseAddress.length; i++) {
    const char = lowercaseAddress[i];
    if (char && parseInt(hash[i] || "0", 16) >= 8) {
      checksumAddress += char.toUpperCase();
    } else {
      checksumAddress += char;
    }
  }

  return checksumAddress;
}

/**
 * Get a valid (trimmed) EVM address, or null if invalid.
 */
export function getValidAddress(
  address: string | undefined | null
): string | null {
  if (!address) return null;
  const trimmed = typeof address === "string" ? address.trim() : address;
  if (!isValidAddress(trimmed)) return null;
  return trimmed;
}

/**
 * Validates an EVM address and returns it in checksummed format.
 */
export function validateAndChecksumAddress(
  address: string
): string | undefined {
  const validAddress = getValidAddress(address);
  return validAddress ? toChecksumAddress(validAddress) : undefined;
}

/**
 * Validates an address for both EVM and Solana chains.
 *
 * For EVM addresses, returns checksummed format.
 * For Solana addresses, returns the Base58 address as-is.
 *
 * When chainId is explicitly provided, validation is strict:
 * - Solana chainId → only Solana validation
 * - Non-Solana chainId → only EVM validation
 *
 * When chainId is omitted, EVM is tried first with Solana fallback.
 */
export function validateAddress(
  address: string,
  chainId?: number | null
): string | undefined {
  // Explicit Solana chainId → validate ONLY as Solana
  if (chainId !== undefined && chainId !== null && isSolanaChainId(chainId)) {
    return getValidSolanaAddress(address) || undefined;
  }

  // Explicit non-Solana chainId → validate ONLY as EVM
  if (chainId !== undefined && chainId !== null) {
    return validateAndChecksumAddress(address);
  }

  // No chainId → try EVM first, then Solana fallback
  const validEvmAddress = validateAndChecksumAddress(address);
  if (validEvmAddress) {
    return validEvmAddress;
  }

  if (isSolanaAddress(address)) {
    return getValidSolanaAddress(address) || undefined;
  }

  return undefined;
}

/**
 * Blocked EVM addresses that should not emit events
 * (zero address, dead address)
 */
const BLOCKED_ADDRESSES = new Set<string>([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

/**
 * Check if an address is in a blocked list.
 * Handles both EVM (zero/dead addresses) and Solana (system program) blocks.
 */
export function isBlockedAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;

  const trimmed = address.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized.startsWith("0x") && normalized.length === 42) {
    return BLOCKED_ADDRESSES.has(normalized);
  }

  if (isSolanaAddress(trimmed)) {
    return isBlockedSolanaAddress(trimmed);
  }

  return false;
}
