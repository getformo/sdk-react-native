export declare enum EventType {
    PAGE = "page",
    SCREEN = "screen",
    IDENTIFY = "identify",
    DETECT = "detect",
    CONNECT = "connect",
    DISCONNECT = "disconnect",
    CHAIN = "chain",
    SIGNATURE = "signature",
    TRANSACTION = "transaction",
    TRACK = "track"
}
export declare enum EventChannel {
    WEB = "web",
    MOBILE = "mobile",
    SERVER = "server",
    SOURCE = "source"
}
export type TEventType = Lowercase<EventType>;
export type TEventChannel = Lowercase<EventChannel>;
export declare const CHANNEL: TEventChannel;
export declare const VERSION = "1";
//# sourceMappingURL=events.d.ts.map