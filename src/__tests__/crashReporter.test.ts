import { CrashReporter } from "../lib/crash";
import { LIFECYCLE_EVENT } from "../constants/events";

/**
 * CrashReporter wraps React Native's global error handler. The invariant that
 * matters most is that it never breaks the chain: the previous handler is what
 * shows the redbox in development, terminates the process on a fatal error in
 * production, and runs whatever crash reporter the app already installed.
 */
describe("CrashReporter", () => {
  type Handler = (error: Error, isFatal?: boolean) => void;

  let previous: jest.Mock;
  let current: Handler | undefined;
  let analytics: { track: jest.Mock; flush: jest.Mock };

  const globalWithErrorUtils = globalThis as {
    ErrorUtils?: {
      getGlobalHandler: () => Handler | undefined;
      setGlobalHandler: (h: Handler) => void;
    };
  };

  beforeEach(() => {
    previous = jest.fn();
    current = previous;
    globalWithErrorUtils.ErrorUtils = {
      getGlobalHandler: () => current,
      setGlobalHandler: (h: Handler) => {
        current = h;
      },
    };
    analytics = {
      track: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    delete globalWithErrorUtils.ErrorUtils;
  });

  const crash = (error: Error, isFatal?: boolean) => current?.(error, isFatal);

  it("tracks Application Crashed with message, name and fatal flag", async () => {
    new CrashReporter(analytics).start();
    crash(new TypeError("boom"), true);
    await Promise.resolve();

    expect(analytics.track).toHaveBeenCalledWith(
      LIFECYCLE_EVENT.APPLICATION_CRASHED,
      expect.objectContaining({ message: "boom", name: "TypeError", fatal: true }),
    );
  });

  it("marks non-fatal errors as fatal: false", () => {
    new CrashReporter(analytics).start();
    crash(new Error("recoverable"), false);

    expect(analytics.track).toHaveBeenCalledWith(
      LIFECYCLE_EVENT.APPLICATION_CRASHED,
      expect.objectContaining({ fatal: false }),
    );
  });

  it("always calls the previous handler", () => {
    new CrashReporter(analytics).start();
    const error = new Error("boom");
    crash(error, true);

    expect(previous).toHaveBeenCalledWith(error, true);
  });

  it("still calls the previous handler when tracking throws", () => {
    // A crash must never be swallowed by our own reporting failing.
    analytics.track.mockImplementation(() => {
      throw new Error("queue is broken");
    });
    new CrashReporter(analytics).start();
    const error = new Error("boom");

    expect(() => crash(error, true)).not.toThrow();
    expect(previous).toHaveBeenCalledWith(error, true);
  });

  it("does not throw when a rejected track promise is unhandled", async () => {
    analytics.track.mockRejectedValue(new Error("network down"));
    new CrashReporter(analytics).start();

    expect(() => crash(new Error("boom"), true)).not.toThrow();
    await Promise.resolve();
    expect(previous).toHaveBeenCalled();
  });

  it("truncates very long stacks and flags the truncation", () => {
    const error = new Error("boom");
    error.stack = "x".repeat(10000);
    new CrashReporter(analytics).start();
    crash(error, true);

    const props = analytics.track.mock.calls[0]![1];
    expect(props.stack.length).toBe(4000);
    expect(props.stack_truncated).toBe(true);
  });

  it("does not flag truncation for a normal stack", () => {
    const error = new Error("boom");
    error.stack = "short stack";
    new CrashReporter(analytics).start();
    crash(error, true);

    expect(analytics.track.mock.calls[0]![1].stack_truncated).toBe(false);
  });

  it("flushes after tracking so the event survives a fatal crash", async () => {
    new CrashReporter(analytics).start();
    crash(new Error("boom"), true);
    await Promise.resolve();
    await Promise.resolve();

    expect(analytics.flush).toHaveBeenCalled();
  });

  it("is idempotent — starting twice does not double-wrap the handler", () => {
    const reporter = new CrashReporter(analytics);
    reporter.start();
    reporter.start();
    crash(new Error("boom"), true);

    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it("restores the previous handler on cleanup", () => {
    const reporter = new CrashReporter(analytics);
    reporter.start();
    expect(current).not.toBe(previous);

    reporter.cleanup();
    expect(current).toBe(previous);
  });

  it("leaves a later handler alone on cleanup", () => {
    // Something else wrapped us after we installed; unhooking the chain here
    // would silently remove that handler too.
    const reporter = new CrashReporter(analytics);
    reporter.start();
    const laterHandler: Handler = jest.fn();
    globalWithErrorUtils.ErrorUtils!.setGlobalHandler(laterHandler);

    reporter.cleanup();
    expect(current).toBe(laterHandler);
  });

  it("no-ops when ErrorUtils is unavailable", () => {
    delete globalWithErrorUtils.ErrorUtils;
    expect(() => new CrashReporter(analytics).start()).not.toThrow();
    expect(analytics.track).not.toHaveBeenCalled();
  });
});
