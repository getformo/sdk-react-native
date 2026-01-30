class LoggerClass {
  config = {
    enabled: false,
    enabledLevels: []
  };
  init(config) {
    this.config = config;
  }
  shouldLog(level) {
    if (!this.config.enabled) return false;
    if (this.config.enabledLevels?.length === 0) return true;
    return this.config.enabledLevels?.includes(level) ?? false;
  }
  debug(...args) {
    if (this.shouldLog("debug")) {
      console.debug("[Formo RN]", ...args);
    }
  }
  info(...args) {
    if (this.shouldLog("info")) {
      console.info("[Formo RN]", ...args);
    }
  }
  warn(...args) {
    if (this.shouldLog("warn")) {
      console.warn("[Formo RN]", ...args);
    }
  }
  error(...args) {
    if (this.shouldLog("error")) {
      console.error("[Formo RN]", ...args);
    }
  }
  log(...args) {
    if (this.shouldLog("log")) {
      console.log("[Formo RN]", ...args);
    }
  }
}
export const Logger = new LoggerClass();
export const logger = Logger;
//# sourceMappingURL=index.js.map