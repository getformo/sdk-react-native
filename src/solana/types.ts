/**
 * Solana-specific type definitions
 */

/**
 * Solana cluster/network types
 * Solana doesn't use chainId like EVM, instead it uses cluster names
 */
export type SolanaCluster = "mainnet-beta" | "testnet" | "devnet" | "localnet";

/**
 * Mapping of Solana clusters to numeric chain IDs for consistency with EVM events
 * These IDs are non-standard but provide a way to identify Solana networks in our analytics
 *
 * Using high numbers (900000+) to avoid collision with EVM chain IDs
 */
export const SOLANA_CHAIN_IDS: Record<SolanaCluster, number> = {
  "mainnet-beta": 900001,
  testnet: 900002,
  devnet: 900003,
  localnet: 900004,
} as const;

/**
 * Default Solana chain ID (mainnet-beta)
 */
export const DEFAULT_SOLANA_CHAIN_ID = SOLANA_CHAIN_IDS["mainnet-beta"];

/**
 * Check if a chain ID belongs to a Solana network.
 */
export function isSolanaChainId(chainId: number | undefined | null): boolean {
  if (chainId === undefined || chainId === null) return false;
  return Object.values(SOLANA_CHAIN_IDS).includes(chainId);
}

/**
 * Solana PublicKey interface
 * Used by address validation utilities.
 */
export interface SolanaPublicKey {
  toBase58(): string;
  toString(): string;
  toBytes(): Uint8Array;
  equals(other: SolanaPublicKey): boolean;
}
