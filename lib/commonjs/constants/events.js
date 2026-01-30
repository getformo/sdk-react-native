"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VERSION = exports.EventType = exports.EventChannel = exports.CHANNEL = void 0;
let EventType = exports.EventType = /*#__PURE__*/function (EventType) {
  EventType["PAGE"] = "page";
  EventType["SCREEN"] = "screen";
  EventType["IDENTIFY"] = "identify";
  EventType["DETECT"] = "detect";
  EventType["CONNECT"] = "connect";
  EventType["DISCONNECT"] = "disconnect";
  EventType["CHAIN"] = "chain";
  EventType["SIGNATURE"] = "signature";
  EventType["TRANSACTION"] = "transaction";
  EventType["TRACK"] = "track";
  return EventType;
}({});
let EventChannel = exports.EventChannel = /*#__PURE__*/function (EventChannel) {
  EventChannel["WEB"] = "web";
  EventChannel["MOBILE"] = "mobile";
  EventChannel["SERVER"] = "server";
  EventChannel["SOURCE"] = "source";
  return EventChannel;
}({});
// React Native SDK uses mobile channel
const CHANNEL = exports.CHANNEL = "mobile";
const VERSION = exports.VERSION = "1";
//# sourceMappingURL=events.js.map