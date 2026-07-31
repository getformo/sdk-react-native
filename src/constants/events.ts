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

// Session inactivity timeout (30 min), matching the GA4 default and Formo's own
// web SDK. A new session_id is minted once the gap since the last tracked event
// exceeds this. Note that mobile-first vendors run tighter: RudderStack and
// Amplitude both default to 5 min on mobile (vs 30 on web) and rotate on
// foreground rather than on inactivity. We keep 30 min so a user's mobile and
// web sessions are directly comparable.
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Reserved lifecycle and campaign event names, per the Segment spec that
 * RudderStack, PostHog and Amplitude all adopted verbatim.
 *
 * These are ordinary `track` events on the wire — the names are what make them
 * recognisable to downstream analytics, so they must match the spec exactly,
 * including capitalisation and spacing.
 *
 * @see https://segment.com/docs/connections/spec/mobile/
 */
export const LIFECYCLE_EVENT = {
  APPLICATION_INSTALLED: "Application Installed",
  APPLICATION_UPDATED: "Application Updated",
  APPLICATION_OPENED: "Application Opened",
  APPLICATION_BACKGROUNDED: "Application Backgrounded",
  APPLICATION_FOREGROUNDED: "Application Foregrounded",
  APPLICATION_CRASHED: "Application Crashed",
  DEEP_LINK_OPENED: "Deep Link Opened",
  PUSH_NOTIFICATION_RECEIVED: "Push Notification Received",
  PUSH_NOTIFICATION_TAPPED: "Push Notification Tapped",
  PUSH_NOTIFICATION_BOUNCED: "Push Notification Bounced",
} as const;

export type TLifecycleEvent =
  (typeof LIFECYCLE_EVENT)[keyof typeof LIFECYCLE_EVENT];
