/**
 * Clamp a number between min and max values
 */
export declare function clampNumber(value: number, max: number, min: number): number;
/**
 * Check if value is undefined
 */
export declare function isUndefined(value: unknown): value is undefined;
/**
 * Convert object keys to snake_case (recursively handles nested objects and arrays)
 * Preserves Date, Map, Set, RegExp, and other built-in objects unchanged
 */
export declare function toSnakeCase<T extends Record<string, unknown>>(obj: T): T;
/**
 * Deep merge two objects
 */
export declare function mergeDeepRight<T extends Record<string, unknown>>(target: T, source: Partial<T>): T;
/**
 * Get action descriptor for logging
 */
export declare function getActionDescriptor(type: string, properties?: Record<string, unknown> | null): string;
/**
 * Check if error is a network error
 */
export declare function isNetworkError(error: unknown): boolean;
//# sourceMappingURL=helpers.d.ts.map