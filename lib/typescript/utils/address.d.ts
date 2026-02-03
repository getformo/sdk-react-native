/**
 * Address validation and checksum utilities
 *
 * Uses ethereum-cryptography for proper EIP-55 checksum computation
 */
/**
 * Check if a string is a valid Ethereum address
 */
export declare function isValidAddress(address: string): boolean;
/**
 * Convert address to EIP-55 checksum format
 *
 * Uses keccak256 from ethereum-cryptography for correct checksumming
 * See: https://eips.ethereum.org/EIPS/eip-55
 */
export declare function toChecksumAddress(address: string): string;
/**
 * Get valid address or null
 */
export declare function getValidAddress(address: string | undefined | null): string | null;
/**
 * Check if address is in blocked list
 */
export declare function isBlockedAddress(address: string): boolean;
//# sourceMappingURL=address.d.ts.map