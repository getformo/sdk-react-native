export enum EventType {
  PAGE = "page",
  SCREEN = "screen",
  IDENTIFY = "identify",
  DETECT = "detect",
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  CHAIN = "chain",
  SIGNATURE = "signature",
  TRANSACTION = "transaction",
  TRACK = "track",
}

export enum EventChannel {
  WEB = "web",
  MOBILE = "mobile",
  SERVER = "server",
  SOURCE = "source",
}

export type TEventType = Lowercase<EventType>;
export type TEventChannel = Lowercase<EventChannel>;

// React Native SDK uses mobile channel
export const CHANNEL: TEventChannel = "mobile";
export const VERSION = "0";

// Session inactivity timeout (30 min), matching the GA4/Segment default. A new
// session_id is minted once the gap since the last tracked event exceeds this.
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
