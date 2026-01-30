export type LogLevel = "debug" | "info" | "warn" | "error" | "log";
interface LoggerConfig {
    enabled?: boolean;
    enabledLevels?: LogLevel[];
}
declare class LoggerClass {
    private config;
    init(config: LoggerConfig): void;
    private shouldLog;
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    log(...args: unknown[]): void;
}
export declare const Logger: LoggerClass;
export declare const logger: LoggerClass;
export {};
//# sourceMappingURL=index.d.ts.map