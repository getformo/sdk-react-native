"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.generateUUID = generateUUID;
exports.hash = hash;
var _sha = require("ethereum-cryptography/sha256");
var _utils = require("ethereum-cryptography/utils");
/**
 * Generate a SHA-256 hash for event deduplication
 * Uses first 16 hex chars (64 bits) for balance of collision resistance and storage
 */
async function hash(input) {
  const bytes = (0, _utils.utf8ToBytes)(input);
  const hashBytes = (0, _sha.sha256)(bytes);
  const hex = (0, _utils.bytesToHex)(hashBytes);
  // Use first 16 chars (64 bits) - provides ~2^32 events before 50% collision probability
  return hex.slice(0, 16);
}

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 0x3 | 0x8;
    return v.toString(16);
  });
}
//# sourceMappingURL=hash.js.map