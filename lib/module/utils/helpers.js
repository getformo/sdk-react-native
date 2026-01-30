/**
 * Clamp a number between min and max values
 */
export function clampNumber(value, max, min) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if value is undefined
 */
export function isUndefined(value) {
  return value === undefined;
}

/**
 * Convert a camelCase/PascalCase string to snake_case
 * Handles consecutive uppercase letters (acronyms) correctly:
 * - "userID" -> "user_id"
 * - "XMLParser" -> "xml_parser"
 * - "getHTTPResponse" -> "get_http_response"
 */
function camelToSnake(str) {
  return str
  // Insert underscore before sequences of uppercase followed by lowercase (e.g., "XMLParser" -> "XML_Parser")
  .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
  // Insert underscore before single uppercase preceded by lowercase (e.g., "userID" -> "user_ID")
  .replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Check if value is a plain object (not Date, Map, Set, RegExp, etc.)
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Convert object keys to snake_case (recursively handles nested objects and arrays)
 * Preserves Date, Map, Set, RegExp, and other built-in objects unchanged
 */
export function toSnakeCase(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key);
    if (Array.isArray(value)) {
      // Recursively convert plain objects inside arrays
      result[snakeKey] = value.map(item => isPlainObject(item) ? toSnakeCase(item) : item);
    } else if (isPlainObject(value)) {
      result[snakeKey] = toSnakeCase(value);
    } else {
      // Preserve Date, Map, Set, RegExp, and other built-in objects unchanged
      result[snakeKey] = value;
    }
  }
  return result;
}

/**
 * Deep merge two objects
 */
export function mergeDeepRight(target, source) {
  const output = {
    ...target
  };
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = output[key];
      if (sourceValue !== null && typeof sourceValue === "object" && !Array.isArray(sourceValue) && targetValue !== null && typeof targetValue === "object" && !Array.isArray(targetValue)) {
        output[key] = mergeDeepRight(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        output[key] = sourceValue;
      }
    }
  }
  return output;
}

/**
 * Get action descriptor for logging
 */
export function getActionDescriptor(type, properties) {
  if (type === "track" && properties?.event) {
    return `track:${properties.event}`;
  }
  if (type === "screen" && properties?.name) {
    return `screen:${properties.name}`;
  }
  return type;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const networkErrorMessages = ["Network request failed", "Failed to fetch", "Network Error", "timeout", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND"];
  return networkErrorMessages.some(msg => message.toLowerCase().includes(msg.toLowerCase()));
}
//# sourceMappingURL=helpers.js.map