"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EVENTS_API_REQUEST_HEADER = exports.EVENTS_API_ORIGIN = exports.EVENTS_API_HOST = exports.COUNTRY_LIST = void 0;
const EVENTS_API_ORIGIN = exports.EVENTS_API_ORIGIN = "https://events.formo.so";
const EVENTS_API_HOST = exports.EVENTS_API_HOST = `${EVENTS_API_ORIGIN}/v0/raw_events`;
const EVENTS_API_REQUEST_HEADER = writeKey => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${writeKey}`
});

// Timezone to country mapping
exports.EVENTS_API_REQUEST_HEADER = EVENTS_API_REQUEST_HEADER;
const COUNTRY_LIST = exports.COUNTRY_LIST = {
  // Africa
  "Africa/Abidjan": "CI",
  "Africa/Accra": "GH",
  "Africa/Addis_Ababa": "ET",
  "Africa/Algiers": "DZ",
  "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA",
  "Africa/Johannesburg": "ZA",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  // America
  "America/Anchorage": "US",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Bogota": "CO",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Mexico_City": "MX",
  "America/New_York": "US",
  "America/Phoenix": "US",
  "America/Sao_Paulo": "BR",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  // Asia
  "Asia/Bangkok": "TH",
  "Asia/Dubai": "AE",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Hong_Kong": "HK",
  "Asia/Jakarta": "ID",
  "Asia/Kolkata": "IN",
  "Asia/Manila": "PH",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Singapore": "SG",
  "Asia/Taipei": "TW",
  "Asia/Tokyo": "JP",
  // Australia
  "Australia/Melbourne": "AU",
  "Australia/Sydney": "AU",
  // Europe
  "Europe/Amsterdam": "NL",
  "Europe/Berlin": "DE",
  "Europe/London": "GB",
  "Europe/Madrid": "ES",
  "Europe/Moscow": "RU",
  "Europe/Paris": "FR",
  "Europe/Rome": "IT",
  "Europe/Zurich": "CH",
  // Pacific
  "Pacific/Auckland": "NZ",
  "Pacific/Honolulu": "US"
};
//# sourceMappingURL=config.js.map