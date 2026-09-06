import { LOCAL_ANONYMOUS_ID_KEY } from "../constants";
import { EventManager } from "../lib/event/EventManager";
import type { IEventQueue } from "../lib/event/types";
import { initStorageManager, storage } from "../lib/storage";

describe("EventManager consent boundary", () => {
  it("drops enrichment that spans opt-out and opt-in", async () => {
    initStorageManager("event-manager-consent");
    storage().remove(LOCAL_ANONYMOUS_ID_KEY);

    let release!: (context: Record<string, unknown>) => void;
    const context = new Promise<Record<string, unknown>>((resolve) => {
      release = resolve;
    });
    let generation = 0;
    let consent = true;
    const queue = {
      enqueue: jest.fn(),
      getGeneration: () => generation,
    } as unknown as IEventQueue;
    const manager = new EventManager(queue, undefined, () => consent);
    jest
      .spyOn(manager.eventFactory as any, "generateContext")
      .mockReturnValue(context);

    const pending = manager.addEvent({ type: "track", event: "pending" });
    consent = false;
    generation++;
    storage().remove(LOCAL_ANONYMOUS_ID_KEY);
    consent = true;
    release({});
    await pending;

    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(storage().get(LOCAL_ANONYMOUS_ID_KEY)).toBeNull();
  });

  it("does not create identity while opted out", async () => {
    initStorageManager("event-manager-opted-out");
    storage().remove(LOCAL_ANONYMOUS_ID_KEY);
    const queue = {
      enqueue: jest.fn(),
      getGeneration: () => 0,
    } as unknown as IEventQueue;
    const manager = new EventManager(queue, undefined, () => false);

    await manager.addEvent({ type: "track", event: "blocked" });

    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(storage().get(LOCAL_ANONYMOUS_ID_KEY)).toBeNull();
  });
});
