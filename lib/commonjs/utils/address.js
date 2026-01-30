"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getValidAddress = getValidAddress;
exports.isBlockedAddress = isBlockedAddress;
exports.isValidAddress = isValidAddress;
exports.toChecksumAddress = toChecksumAddress;
var _keccak = require("ethereum-cryptography/keccak.js");
var _utils = require("ethereum-cryptography/utils.js");
/**
 * Address validation and checksum utilities
 *
 * Uses ethereum-cryptography for proper EIP-55 checksum computation
 */

/**
 * Convert Uint8Array to hex string
 */
function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check if a string is a valid Ethereum address
 */
function isValidAddress(address) {
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
function toChecksumAddress(address) {
  if (!isValidAddress(address)) {
    return address;
  }
  const lowercaseAddress = address.toLowerCase().replace("0x", "");
  const hash = toHex((0, _keccak.keccak256)((0, _utils.utf8ToBytes)(lowercaseAddress)));
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
 * Get valid address or null
 */
function getValidAddress(address) {
  if (!address) return null;
  const trimmed = typeof address === "string" ? address.trim() : address;
  if (!isValidAddress(trimmed)) return null;
  return trimmed;
}

/**
 * Blocked addresses that should not emit events
 * (zero address, dead address)
 */
const BLOCKED_ADDRESSES = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);

/**
 * Check if address is in blocked list
 */
function isBlockedAddress(address) {
  return BLOCKED_ADDRESSES.has(address.toLowerCase());
}
//# sourceMappingURL=address.js.map