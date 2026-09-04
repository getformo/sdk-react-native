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
});
