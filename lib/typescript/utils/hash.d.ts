/**
 * Generate a SHA-256 hash for event deduplication
 * Uses first 16 hex chars (64 bits) for balance of collision resistance and storage
 */
export declare function hash(input: string): Promise<string>;
/**
 * Generate a UUID v4
 */
export declare function generateUUID(): string;
//# sourceMappingURL=hash.d.ts.map