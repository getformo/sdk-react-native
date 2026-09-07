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

describe("EventManager custom-event identity", () => {
  const makeManager = () => {
    initStorageManager("event-manager-identity");
    const queue = {
      enqueue: jest.fn(),
      getGeneration: () => 0,
    } as unknown as IEventQueue;
    return { queue, manager: new EventManager(queue, undefined, () => true) };
  };
  const enqueueCalls = (queue: IEventQueue) =>
    (queue.enqueue as jest.Mock).mock.calls as Array<
      [Record<string, unknown>, unknown, number, { dedupKey?: string; idempotencyKey?: string }]
    >;

  it("fingerprints track calls before SDK context is added", async () => {
    const { queue, manager } = makeManager();
    jest
      .spyOn(manager.eventFactory as any, "generateContext")
      .mockResolvedValueOnce({ screen: "A", app_state: "active" })
      .mockResolvedValueOnce({ screen: "B", app_state: "background" });
    const call = { type: "track" as const, event: "Order Placed", properties: { market: "ZEC" } };

    await manager.addEvent(call);
    await manager.addEvent({ ...call });

    const [first, second] = enqueueCalls(queue);
    expect(first![0].context).not.toEqual(second![0].context);
    expect(second![3].dedupKey).toBe(first![3].dedupKey);
  });

  it("keeps caller-supplied context in the fingerprint", async () => {
    const { queue, manager } = makeManager();
    const call = { type: "track" as const, event: "Order Placed", properties: { market: "ZEC" } };

    await manager.addEvent({ ...call, context: { source: "limit" } });
    await manager.addEvent({ ...call, context: { source: "market" } });

    const [first, second] = enqueueCalls(queue);
    expect(second![3].dedupKey).not.toBe(first![3].dedupKey);
  });

  it("leaves automatic events to the queue's enriched fingerprint", async () => {
    const { queue, manager } = makeManager();

    await manager.addEvent({ type: "connect", chainId: 1, address: "0x1234567890123456789012345678901234567890" });

    expect(enqueueCalls(queue)[0]![3].dedupKey).toBeUndefined();
  });

  it("forwards the idempotency key without adding it to the event", async () => {
    const { queue, manager } = makeManager();

    await manager.addEvent({
      type: "track",
      event: "Order Placed",
      properties: { market: "ZEC" },
      idempotencyKey: "order-123",
    });

    const [call] = enqueueCalls(queue);
    expect(call![0]).not.toHaveProperty("idempotencyKey");
    expect(call![0].properties).toEqual({ market: "ZEC" });
    expect(call![3].idempotencyKey).toBe("order-123");
  });
});
