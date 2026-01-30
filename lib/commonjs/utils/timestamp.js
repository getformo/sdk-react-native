"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getCurrentTimeFormatted = getCurrentTimeFormatted;
exports.millisecondsToSecond = millisecondsToSecond;
exports.toDateHourMinute = toDateHourMinute;
/**
 * Get current time in ISO format
 */
function getCurrentTimeFormatted() {
  return new Date().toISOString();
}

/**
 * Format date to YYYY-MM-DD HH:mm format for hashing
 */
function toDateHourMinute(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Convert milliseconds to seconds
 */
function millisecondsToSecond(ms) {
  return Math.floor(ms / 1000);
}
//# sourceMappingURL=timestamp.js.map