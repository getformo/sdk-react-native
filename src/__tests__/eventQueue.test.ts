import { EventQueue } from "../lib/event/EventQueue";
import type { IFormoEvent } from "../types";

/** Minimal shape of Node's process needed here; @types/node isn't a dep. */
type NodeProcess = {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};

/**
 * EventQueue batching and callback-isolation behaviour (ported from the web
 * SDK's #326).
 */
describe("EventQueue", () => {
  let fetchMock: jest.Mock;

  const makeQueue = (options: Partial<{ flushAt: number }> = {}) =>
    new EventQueue("test-write-key", {
      apiHost: "https://events.formo.test",
      flushAt: options.flushAt ?? 20,
    });

  /** Distinct events, so the queue's dedup hash never collides. */
  const makeEvent = (n: number): IFormoEvent =>
    ({
      type: "track",
      event: `event-${n}`,
      original_timestamp: new Date(2026, 0, 1, 0, 0, n).toISOString(),
      session_id: "session-1",
      anonymous_id: "anon-1",
      context: {},
      properties: { n },
    }) as unknown as IFormoEvent;

  /** Batches actually POSTed, flattened into one array of events. */
  const sentEvents = () =>
    fetchMock.mock.calls.flatMap(
      ([, init]) => JSON.parse(init.body as string) as Array<{ event: string }>
    );

  /**
   * enqueue kicks off flush without awaiting it, so tests have to let the
   * pending microtasks and the flush mutex settle before asserting.
   */
  const settle = () =>
    new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 0);
    });

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
  });

  describe("first event of the app session", () => {
    it("flushes immediately instead of waiting for flushAt", async () => {
      const queue = makeQueue({ flushAt: 20 });

      await queue.enqueue(makeEvent(1));
      // enqueue kicks off flush without awaiting it; let the microtasks run.
      await settle();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sentEvents().map((e) => e.event)).toEqual(["event-1"]);

      await queue.cleanup();
    });

    it("batches subsequent events rather than flushing each one", async () => {
      const queue = makeQueue({ flushAt: 20 });

      await queue.enqueue(makeEvent(1));
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await queue.enqueue(makeEvent(2));
      await queue.enqueue(makeEvent(3));
      await settle();

      // Still only the landing event has gone out; 2 and 3 are batching.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await queue.cleanup();
      expect(sentEvents().map((e) => e.event)).toEqual([
        "event-1",
        "event-2",
        "event-3",
      ]);
    });

    it("still honours flushAt once the first event has shipped", async () => {
      const queue = makeQueue({ flushAt: 2 });

      await queue.enqueue(makeEvent(1));
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await queue.enqueue(makeEvent(2));
      await queue.enqueue(makeEvent(3));
      await settle();

      expect(fetchMock).toHaveBeenCalledTimes(2);

      await queue.cleanup();
    });
  });

  describe("interval flush", () => {
    it("does not leave an unhandled rejection when the API rejects", async () => {
      jest.useFakeTimers();
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      const proc = (globalThis as unknown as { process: NodeProcess }).process;
      proc.on("unhandledRejection", onUnhandled);

      try {
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        // Burn the first-event flush so the next event arms the interval timer.
        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(60_000);
        await queue.enqueue(makeEvent(2));

        // Fire the interval timer and let the retry backoff play out.
        await jest.advanceTimersByTimeAsync(60_000);

        expect(fetchMock).toHaveBeenCalled();
        expect(unhandled).toEqual([]);

        queue.clear();
        await queue.cleanup();
      } finally {
        proc.off("unhandledRejection", onUnhandled);
        jest.useRealTimers();
      }
    });
  });

  describe("consumer callbacks", () => {
    it("does not let a throwing callback escape flush() on an empty queue", async () => {
      const queue = makeQueue();
      const throwing = () => {
        throw new Error("callback blew up");
      };

      await expect(queue.flush(throwing)).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();

      await queue.cleanup();
    });

    it("does not let a throwing per-event callback escape a successful flush", async () => {
      const queue = makeQueue();
      const throwing = jest.fn(() => {
        throw new Error("callback blew up");
      });

      await queue.enqueue(makeEvent(1), throwing);
      await settle();

      expect(throwing).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await queue.cleanup();
    });

    it("runs every per-event callback even when an earlier one throws", async () => {
      const queue = makeQueue({ flushAt: 2 });
      const throwing = jest.fn(() => {
        throw new Error("callback blew up");
      });
      const later = jest.fn();

      // Ship the landing event first so the next two batch together.
      await queue.enqueue(makeEvent(0));
      await settle();

      await queue.enqueue(makeEvent(1), throwing);
      await queue.enqueue(makeEvent(2), later);
      await settle();

      expect(throwing).toHaveBeenCalled();
      expect(later).toHaveBeenCalled();

      await queue.cleanup();
    });
  });
});
