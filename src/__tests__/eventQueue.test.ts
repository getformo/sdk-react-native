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

  describe("retry after a failed flush", () => {
    it("re-arms the interval timer when the first-event flush fails", async () => {
      jest.useFakeTimers();
      try {
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        // The first event flushes immediately. A cold start is exactly when the
        // radio may still be waking, so this attempt is the one most likely to
        // fail — and the event it carries is the attribution event.
        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(30_000);

        const afterFirstFlush = fetchMock.mock.calls.length;
        expect(afterFirstFlush).toBeGreaterThan(0);

        // Nothing else is enqueued and the app stays foregrounded. The
        // re-queued event must still get another attempt.
        await jest.advanceTimersByTimeAsync(60_000);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirstFlush);

        queue.clear();
        await queue.cleanup();
      } finally {
        jest.useRealTimers();
      }
    });

    it("keeps retrying until the send finally succeeds", async () => {
      jest.useFakeTimers();
      try {
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(60_000);

        // Only count what goes out AFTER connectivity returns — fetchMock also
        // records the failed attempts, whose bodies carry the same event.
        fetchMock.mockClear();
        fetchMock.mockResolvedValue({ ok: true, status: 200 });
        await jest.advanceTimersByTimeAsync(60_000);

        const delivered = fetchMock.mock.calls.flatMap(
          ([, init]) => JSON.parse(init.body as string) as Array<{ event: string }>
        );
        expect(delivered.map((e) => e.event)).toContain("event-1");

        // And the queue is actually drained, not merely re-attempted.
        fetchMock.mockClear();
        await jest.advanceTimersByTimeAsync(60_000);
        expect(fetchMock).not.toHaveBeenCalled();

        await queue.cleanup();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("permanent send failures", () => {
    it("stops re-posting a batch the API rejected permanently", async () => {
      jest.useFakeTimers();
      try {
        // 400: an invalid write key or malformed payload. shouldRetry() is
        // false, so sendWithRetry rejects without retrying.
        fetchMock.mockResolvedValue({ ok: false, status: 400 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 3,
        });

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(30_000);

        // One attempt, no retries — the status is not retryable.
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // And it must not be re-posted every interval for the process lifetime.
        await jest.advanceTimersByTimeAsync(300_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await queue.cleanup();
      } finally {
        jest.useRealTimers();
      }
    });

    it("still retries a 429 rather than dropping it", async () => {
      jest.useFakeTimers();
      try {
        fetchMock.mockResolvedValue({ ok: false, status: 429 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(30_000);
        const afterFirst = fetchMock.mock.calls.length;
        expect(afterFirst).toBeGreaterThan(1); // initial + retry

        await jest.advanceTimersByTimeAsync(60_000);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);

        queue.clear();
        await queue.cleanup();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("cleanup", () => {
    it("waits for an in-flight flush and arms no timer afterwards", async () => {
      let releaseSend: (value: { ok: boolean; status: number }) => void;
      const inFlight = new Promise<{ ok: boolean; status: number }>((resolve) => {
        releaseSend = resolve;
      });
      fetchMock.mockReturnValueOnce(inFlight);

      const queue = new EventQueue("test-write-key", {
        apiHost: "https://events.formo.test",
        flushAt: 20,
        flushInterval: 10_000,
        retryCount: 0,
      });

      // The first event flushes immediately; its items are spliced out of the
      // queue, so a naive cleanup would see an empty queue and return early.
      await queue.enqueue(makeEvent(1));
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      let cleanupDone = false;
      const cleanup = queue.cleanup().then(() => {
        cleanupDone = true;
      });

      await settle();
      expect(cleanupDone).toBe(false); // still waiting on the in-flight send

      // Fail it, so the items are re-queued during teardown.
      releaseSend!({ ok: false, status: 500 });
      await cleanup;
      expect(cleanupDone).toBe(true);

      // No timer may survive teardown and fire network calls afterwards.
      const callsAtCleanup = fetchMock.mock.calls.length;
      jest.useFakeTimers();
      try {
        await jest.advanceTimersByTimeAsync(300_000);
        expect(fetchMock.mock.calls.length).toBe(callsAtCleanup);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("clear() during an in-flight flush", () => {
    it("does not resurrect events cleared while a batch was in flight", async () => {
      let releaseSend: (value: { ok: boolean; status: number }) => void;
      fetchMock.mockReturnValueOnce(
        new Promise((resolve) => {
          releaseSend = resolve;
        })
      );

      const queue = makeQueue();
      await queue.enqueue(makeEvent(1));
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Opt-out mid-flight. The batch is already spliced out of the queue, so
      // clear() cannot see it.
      queue.clear();

      // The send then fails — those events must NOT come back.
      releaseSend!({ ok: false, status: 500 });
      await settle();

      const callsAfterClear = fetchMock.mock.calls.length;
      jest.useFakeTimers();
      try {
        await jest.advanceTimersByTimeAsync(300_000);
        expect(fetchMock.mock.calls.length).toBe(callsAfterClear);
      } finally {
        jest.useRealTimers();
      }

      await queue.cleanup();
    });
  });

  describe("background flush", () => {
    it("re-arms the interval when the background flush fails", async () => {
      const { AppState } = jest.requireMock("react-native") as {
        AppState: { addEventListener: jest.Mock };
      };

      jest.useFakeTimers();
      try {
        // Succeed first, so the first-event flush drains the queue and leaves
        // no timer pending — the background flush below is then the only thing
        // that can clear one.
        fetchMock.mockResolvedValue({ ok: true, status: 200 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          // Must be truthy: the constructor treats 0 as "unset" and would
          // substitute the default of 3, whose backoffs would then be
          // indistinguishable from a re-armed interval flush.
          retryCount: 1,
        });

        // The constructor registers the AppState listener; grab it.
        const handler = AppState.addEventListener.mock.calls.at(-1)?.[1] as (
          s: string
        ) => void;
        expect(typeof handler).toBe("function");

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(60_000);

        // Queue a second event: this arms the interval timer.
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        await queue.enqueue(makeEvent(2));

        // Background before that timer fires. flush() clears the timer on
        // entry, and the send then fails and re-queues the event.
        handler("background");
        // Long enough for both attempts and the 1s backoff to finish, but
        // short of the 10s interval — so any later call can only come from a
        // timer the failure path armed, not from sendWithRetry.
        await jest.advanceTimersByTimeAsync(4_000);
        const afterBackground = fetchMock.mock.calls.length;
        expect(afterBackground).toBe(3); // 1 first-event + 2 background attempts

        // Nothing else happens — no new event, no foreground, no cleanup. The
        // re-queued event must still get another attempt. One interval is
        // enough to prove it; the flush re-arms on each failure, so advancing
        // much further just spins the retry loop.
        await jest.advanceTimersByTimeAsync(15_000);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(afterBackground);

        // Deliberately no cleanup() here. The re-armed flush is mid retry
        // backoff, sleeping in a fake timer; cleanup() awaits the flush mutex,
        // which that flush only releases once its backoff fires. Advancing far
        // enough just re-arms again, so awaiting cleanup would hang. Dropping
        // the fake timers below discards the pending work instead.
        queue.clear();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("background transition during teardown", () => {
    it("ignores a background flush once cleanup has started", async () => {
      const { AppState } = jest.requireMock("react-native") as {
        AppState: { addEventListener: jest.Mock };
      };

      jest.useFakeTimers();
      try {
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });
        const handler = AppState.addEventListener.mock.calls.at(-1)?.[1] as (
          s: string
        ) => void;

        // Fail the send so the event survives in the queue through teardown.
        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(5_000);

        const cleanupPromise = queue.cleanup();
        await jest.advanceTimersByTimeAsync(30_000);
        await cleanupPromise;

        // A backgrounding app after teardown must not start another send.
        fetchMock.mockClear();
        handler("background");
        await jest.advanceTimersByTimeAsync(30_000);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("clear() during retry backoff", () => {
    it("abandons a batch cleared between retry attempts", async () => {
      jest.useFakeTimers();
      try {
        // Retryable, so the first failure schedules a backoff before attempt 2.
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 3,
        });

        await queue.enqueue(makeEvent(1));
        // Let attempt 1 fail and enter backoff, but not reach attempt 2.
        await jest.advanceTimersByTimeAsync(100);
        const callsBeforeOptOut = fetchMock.mock.calls.length;
        expect(callsBeforeOptOut).toBe(1);

        // Consent withdrawn mid-backoff.
        queue.clear();

        // Even if the API would now accept them, no further attempt may go out.
        fetchMock.mockResolvedValue({ ok: true, status: 200 });
        await jest.advanceTimersByTimeAsync(300_000);
        expect(fetchMock.mock.calls.length).toBe(callsBeforeOptOut);

        await queue.cleanup();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("dedup across clear()", () => {
    it("does not strip the dedup entry of an event re-enqueued after clear()", async () => {
      let releaseSend: (value: { ok: boolean; status: number }) => void;
      fetchMock.mockReturnValueOnce(
        new Promise((resolve) => {
          releaseSend = resolve;
        })
      );

      const queue = makeQueue({ flushAt: 20 });
      await queue.enqueue(makeEvent(1));
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Opt out, then the same event is produced again and re-enqueued.
      queue.clear();
      await queue.enqueue(makeEvent(1));
      await settle();

      // The original send now succeeds. It must not delete the hash that the
      // newly queued copy of the same event depends on.
      releaseSend!({ ok: true, status: 200 });
      await settle();

      // A third identical enqueue must still be recognised as a duplicate.
      fetchMock.mockClear();
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      await queue.enqueue(makeEvent(1));
      await queue.flush();
      await settle();

      const delivered = fetchMock.mock.calls.flatMap(
        ([, init]) => JSON.parse(init.body as string) as Array<{ event: string }>
      );
      expect(delivered.filter((e) => e.event === "event-1")).toHaveLength(1);

      await queue.cleanup();
    });
  });

  describe("dedup across reset()", () => {
    it("keeps the buffered event and admits the same payload after reset", async () => {
      const queue = makeQueue({ flushAt: 20 });
      const generateMessageId = jest
        .spyOn(queue as any, "generateMessageId")
        .mockImplementation(async (_event: any, generation: any = 0) =>
          `message-${generation}`
        );

      await queue.enqueue(makeEvent(0));
      await settle();
      await queue.enqueue(makeEvent(1));
      queue.advanceDeduplication();
      await queue.enqueue(makeEvent(1));
      await queue.flush();
      await settle();

      const resetBatch = fetchMock.mock.calls
        .flatMap(([, init]) => JSON.parse(init.body as string))
        .filter((event) => event.event === "event-1");
      expect(resetBatch.map((event) => event.message_id)).toEqual([
        "message-0",
        "message-1",
      ]);
      generateMessageId.mockRestore();
      await queue.cleanup();
    });
  });

  describe("enqueue racing clear()", () => {
    it("drops an event whose hashing was still pending when the user opted out", async () => {
      const queue = makeQueue();

      // Do NOT await: enqueue suspends on the async message-id hash, so the
      // event has not reached the queue that clear() empties.
      const pending = queue.enqueue(makeEvent(1));
      queue.clear();
      await pending;
      await settle();

      expect(fetchMock).not.toHaveBeenCalled();

      await queue.cleanup();
    });
  });

  describe("cleanup with a stalled request", () => {
    it("completes rather than hanging when the send never settles", async () => {
      jest.useFakeTimers();
      try {
        // A connection that never resolves and never rejects. React Native's
        // fetch has no request timeout, so nothing else will end this.
        fetchMock.mockReturnValue(new Promise(() => {}));

        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        // The first event flushes immediately and hangs mid-send.
        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(100);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        let done = false;
        const cleanup = queue.cleanup().then(() => {
          done = true;
        });

        // Still stuck on the in-flight send.
        await jest.advanceTimersByTimeAsync(1_000);
        expect(done).toBe(false);

        // Past the bound, teardown gives up on it and finishes.
        await jest.advanceTimersByTimeAsync(10_000);
        await cleanup;
        expect(done).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("cleanup abandoning a stalled batch", () => {
    it("does not let a stalled flush resurrect and resend its events", async () => {
      jest.useFakeTimers();
      try {
        let releaseStall: (value: { ok: boolean; status: number }) => void;
        fetchMock.mockReturnValueOnce(
          new Promise((resolve) => {
            releaseStall = resolve;
          })
        );
        // Everything after the stall fails retryably, so the stalled flush
        // exhausts its retries and takes the re-queue path.
        fetchMock.mockResolvedValue({ ok: false, status: 500 });

        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 1,
          flushInterval: 10_000,
          retryCount: 1,
        });

        // Flush A splices event 1 and stalls mid-send.
        const callback = jest.fn();
        await queue.enqueue(makeEvent(1), callback);
        await jest.advanceTimersByTimeAsync(100);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Flush B is queued behind A, waiting on its mutex.
        await queue.enqueue(makeEvent(2));

        // Teardown gives up on A after the bound and returns.
        const cleanup = queue.cleanup();
        await jest.advanceTimersByTimeAsync(10_000);
        await cleanup;

        // A only now fails. It must not put event 1 back for B to send.
        releaseStall!({ ok: false, status: 500 });
        await jest.advanceTimersByTimeAsync(60_000);

        // Nothing may call back into a torn-down instance: A's batch was
        // abandoned by cleanup, and any invocation here means B resurrected
        // the event and sent it after teardown had already completed.
        expect(callback).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("cleanup with a stalled drain flush", () => {
    it("completes when a flush cleanup itself starts never settles", async () => {
      jest.useFakeTimers();
      try {
        // First send succeeds, so nothing is in flight when cleanup begins and
        // the in-flight wait returns immediately. The stall happens on the
        // request the drain loop opens.
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
        fetchMock.mockReturnValue(new Promise(() => {}));

        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(100);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Queue a second event, but do not let its interval fire — it is still
        // sitting in the queue with no request in flight.
        await queue.enqueue(makeEvent(2));

        let done = false;
        const cleanup = queue.cleanup().then(() => {
          done = true;
        });

        // The drain loop opens a request for event 2, which never settles.
        await jest.advanceTimersByTimeAsync(1_000);
        expect(done).toBe(false);

        // Teardown must still finish once the deadline passes.
        await jest.advanceTimersByTimeAsync(10_000);
        await cleanup;
        expect(done).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("callbacks after an abandoned teardown", () => {
    it("does not invoke callbacks when the abandoned request finally settles", async () => {
      jest.useFakeTimers();
      try {
        let releaseStall: (value: { ok: boolean; status: number }) => void;
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
        fetchMock.mockReturnValue(
          new Promise((resolve) => {
            releaseStall = resolve;
          })
        );

        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(100);

        // Queued with a callback, no request in flight.
        const callback = jest.fn();
        await queue.enqueue(makeEvent(2), callback);

        // The drain loop opens a request for it, which stalls past the
        // deadline; teardown abandons it and returns.
        const cleanup = queue.cleanup();
        await jest.advanceTimersByTimeAsync(10_000);
        await cleanup;
        expect(callback).not.toHaveBeenCalled();

        // The abandoned request settles long afterwards. The app has already
        // torn the SDK down, so nothing may call back into it.
        releaseStall!({ ok: true, status: 200 });
        await jest.advanceTimersByTimeAsync(60_000);
        expect(callback).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("flush racing cleanup", () => {
    it("does not let a flush queued behind cleanup send abandoned events", async () => {
      jest.useFakeTimers();
      try {
        let releaseDrain: (value: { ok: boolean; status: number }) => void;
        // 1st: the first-event flush, succeeds and empties the queue.
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
        // 2nd: the request cleanup's drain loop opens — held so a consumer
        // flush can queue behind it.
        fetchMock.mockReturnValueOnce(
          new Promise((resolve) => {
            releaseDrain = resolve;
          })
        );
        // Everything after fails retryably, so the drain flush re-queues its
        // event and cleanup breaks out of the loop instead of emptying it.
        fetchMock.mockResolvedValue({ ok: false, status: 500 });

        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(100);

        const callback = jest.fn();
        await queue.enqueue(makeEvent(2), callback);

        // Nothing is in flight, so cleanup's wait returns at once and its
        // drain loop opens the held request.
        const cleanupPromise = queue.cleanup();
        await jest.advanceTimersByTimeAsync(10);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // A consumer flush now queues behind cleanup's own.
        const racing = queue.flush().catch(() => {});

        // Let the drain flush fail within the deadline and re-queue.
        releaseDrain!({ ok: false, status: 500 });
        await jest.advanceTimersByTimeAsync(4_000);
        await cleanupPromise;

        // Sends and callbacks up to here were on a live instance. Nothing more
        // may happen now that teardown has resolved.
        const sendsAtCleanup = fetchMock.mock.calls.length;
        const callbacksAtCleanup = callback.mock.calls.length;

        await jest.advanceTimersByTimeAsync(30_000);
        await racing;

        // The racing flush takes the mutex the instant cleanup's drain flush
        // releases it — before cleanup() has even observed that failure — so
        // measuring only after cleanup() resolves would miss its send. Assert
        // the absolute count instead: 1 first-event send, then the drain
        // flush's attempt and its one retry. The racing flush must add none.
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(sendsAtCleanup).toBe(3);
        expect(callbacksAtCleanup).toBe(callback.mock.calls.length);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("concurrent cleanup", () => {
    it("joins the teardown already under way instead of racing it", async () => {
      jest.useFakeTimers();
      try {
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
        // The drain flush fails retryably and re-queues, which is what a second
        // teardown would otherwise pick up and send.
        fetchMock.mockResolvedValue({ ok: false, status: 500 });

        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(100);

        const callback = jest.fn();
        await queue.enqueue(makeEvent(2), callback);

        // Two teardowns started concurrently — the provider can call cleanup
        // more than once, and it is public API besides.
        const first = queue.cleanup();
        const second = queue.cleanup();
        await jest.advanceTimersByTimeAsync(30_000);
        await Promise.all([first, second]);

        const sendsAfterTeardown = fetchMock.mock.calls.length;
        const callbacksAfterTeardown = callback.mock.calls.length;

        await jest.advanceTimersByTimeAsync(30_000);
        expect(fetchMock.mock.calls.length).toBe(sendsAfterTeardown);
        expect(callback.mock.calls.length).toBe(callbacksAfterTeardown);

        // 1 first-event send, then the single drain flush and its one retry.
        // A second teardown would add its own attempts on top.
        expect(fetchMock).toHaveBeenCalledTimes(3);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("cleanup robustness", () => {
    it("still settles, and empties the queue, if teardown throws", async () => {
      const { AppState } = jest.requireMock("react-native") as {
        AppState: { addEventListener: jest.Mock };
      };
      AppState.addEventListener.mockReturnValueOnce({
        remove: () => {
          throw new Error("native module gone");
        },
      });

      const queue = makeQueue();
      const callback = jest.fn();
      await queue.enqueue(makeEvent(1), callback);
      await settle();

      // Must resolve rather than reject, and must not poison later calls.
      await expect(queue.cleanup()).resolves.toBeUndefined();
      await expect(queue.cleanup()).resolves.toBeUndefined();

      fetchMock.mockClear();
      await queue.flush();
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not invoke a flush callback after teardown", async () => {
      let releaseStall: (value: { ok: boolean; status: number }) => void;
      fetchMock.mockReturnValueOnce(
        new Promise((resolve) => {
          releaseStall = resolve;
        })
      );

      const queue = makeQueue();
      await queue.enqueue(makeEvent(1));
      await settle();

      // A consumer flush queued behind the stalled one.
      const flushCallback = jest.fn();
      const racing = queue.flush(flushCallback);

      await queue.cleanup();
      expect(flushCallback).not.toHaveBeenCalled();

      // The stalled send settles long after teardown; the queued flush then
      // resumes and must not call back into the instance.
      releaseStall!({ ok: true, status: 200 });
      await racing;
      await settle();
      expect(flushCallback).not.toHaveBeenCalled();
    }, 20_000);
  });

  describe("enqueue racing cleanup", () => {
    it("drops an event whose hashing was still pending when cleanup ran", async () => {
      const queue = makeQueue();

      // Do NOT await: enqueue suspends on the async message-id hash.
      const pending = queue.enqueue(makeEvent(1));
      await queue.cleanup();
      await pending;
      await settle();

      // Nothing may be sent on an instance that has already been torn down.
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("retryable status codes", () => {
    it("retries a 408 request timeout instead of dropping the batch", async () => {
      jest.useFakeTimers();
      try {
        fetchMock.mockResolvedValue({ ok: false, status: 408 });
        const queue = new EventQueue("test-write-key", {
          apiHost: "https://events.formo.test",
          flushAt: 20,
          flushInterval: 10_000,
          retryCount: 1,
        });

        await queue.enqueue(makeEvent(1));
        await jest.advanceTimersByTimeAsync(30_000);
        const afterFirst = fetchMock.mock.calls.length;
        expect(afterFirst).toBeGreaterThan(1); // retried, not dropped

        // Still queued, so the interval keeps trying.
        await jest.advanceTimersByTimeAsync(60_000);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);

        queue.clear();
        await queue.cleanup();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("consumer callbacks", () => {
    it("does not let a rejected async callback escape as an unhandled rejection", async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      const proc = (globalThis as unknown as { process: NodeProcess }).process;
      proc.on("unhandledRejection", onUnhandled);

      try {
        const queue = makeQueue();
        // An async callback reports failure by rejecting, not by throwing.
        const rejecting = async () => {
          throw new Error("async callback blew up");
        };

        await queue.enqueue(makeEvent(1), rejecting);
        await settle();
        await queue.flush(rejecting);
        await settle();

        expect(unhandled).toEqual([]);
        await queue.cleanup();
      } finally {
        proc.off("unhandledRejection", onUnhandled);
      }
    });

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
