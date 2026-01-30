export let EventType = /*#__PURE__*/function (EventType) {
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
export let EventChannel = /*#__PURE__*/function (EventChannel) {
  EventChannel["WEB"] = "web";
  EventChannel["MOBILE"] = "mobile";
  EventChannel["SERVER"] = "server";
  EventChannel["SOURCE"] = "source";
  return EventChannel;
}({});
// React Native SDK uses mobile channel
export const CHANNEL = "mobile";
export const VERSION = "1";
//# sourceMappingURL=events.js.map