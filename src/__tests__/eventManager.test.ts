import { LOCAL_ANONYMOUS_ID_KEY } from "../constants";
import { EventManager } from "../lib/event/EventManager";
import { initStorageManager, storage } from "../lib/storage";
import type { IEventQueue } from "../lib/event/types";

describe("EventManager consent boundary", () => {
  it("cancels enrichment still running across opt-out and opt-in", async () => {
    initStorageManager("event-manager-consent");
    storage().remove(LOCAL_ANONYMOUS_ID_KEY);

    let release!: (context: Record<string, unknown>) => void;
    const context = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve;
    });
    const queue = {
      enqueue: jest.fn(),
      clear: jest.fn(),
      getDeduplicationGeneration: jest.fn().mockReturnValue(0),
      advanceDeduplication: jest.fn(),
    } as unknown as IEventQueue;
    let consent = true;
    const manager = new EventManager(queue, undefined, () => consent);
    jest
      .spyOn(manager.eventFactory as any, "generateContext")
      .mockReturnValue(context);

    const pending = manager.addEvent({ type: "track", event: "pending" });
    consent = false;
    manager.clear();
    consent = true;
    release({});
    await pending;

    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(storage().get(LOCAL_ANONYMOUS_ID_KEY)).toBeNull();
  });

  it("captures deduplication before enrichment", async () => {
    let generation = 0;
    let release!: (event: Record<string, unknown>) => void;
    const created = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve;
    });
    const queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      getDeduplicationGeneration: jest.fn(() => generation),
      clear: jest.fn(),
      advanceDeduplication: jest.fn(() => generation++),
    } as unknown as IEventQueue;
    const manager = new EventManager(queue);
    jest.spyOn(manager.eventFactory, "create").mockReturnValue(created as any);

    const beforeReset = manager.addEvent({ type: "track", event: "same" });
    manager.advanceDeduplication();
    const afterReset = manager.addEvent({ type: "track", event: "same" });
    release({ type: "track", event: "same", context: {} });
    await Promise.all([beforeReset, afterReset]);

    expect(queue.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      0
    );
    expect(queue.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      1
    );
  });
});
