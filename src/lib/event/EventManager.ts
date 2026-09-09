import { Address, APIEvent, Options } from "../../types";
import { logger } from "../logger";
import { EVENT_CREATION_CANCELLED, EventFactory } from "./EventFactory";
import { IEventFactory, IEventManager, IEventQueue } from "./types";
import { isBlockedAddress } from "../../utils/address";
import { hash, stableStringify } from "../../utils/hash";

/**
 * Event manager for React Native SDK
 * Generates valid event payloads and queues them for processing
 */
class EventManager implements IEventManager {
  eventQueue: IEventQueue;
  eventFactory: IEventFactory;

  constructor(
    eventQueue: IEventQueue,
    options?: Options,
    canCreate: () => boolean = () => true
  ) {
    this.eventQueue = eventQueue;
    this.eventFactory = new EventFactory(options, canCreate);
  }

  /**
   * Add event to queue
   */
  async addEvent(
    event: APIEvent,
    address?: Address,
    userId?: string
  ): Promise<void> {
    const { callback, ...eventWithoutCallback } = event;
    const { idempotencyKey, ..._event } = eventWithoutCallback as APIEvent & {
      idempotencyKey?: string;
    };
    const generation = this.eventQueue.getGeneration();

    // Taken before the enrichment await, from the caller's input as it is
    // now: a properties object the app mutates while enrichment is pending
    // must not fingerprint the event under values it did not carry.
    // Custom events are fingerprinted on what the caller passed, so SDK
    // context that changes between two identical calls does not split them.
    // Keys are sorted so the order the caller wrote them in does not either.
    const dedupKey =
      event.type === "track"
        ? hash(
            stableStringify({
              event: _event,
              address: address ?? null,
              userId: userId ?? null,
            }) ?? ""
          )
        : undefined;

    let formoEvent;
    try {
      formoEvent = await this.eventFactory.create(_event, address, userId);
    } catch (error) {
      if (error === EVENT_CREATION_CANCELLED) return;
      throw error;
    }

    if (this.eventQueue.getGeneration() !== generation) return;

    // Check if the final event has a blocked address
    if (formoEvent.address && isBlockedAddress(formoEvent.address)) {
      logger.warn(
        `Event blocked: Address ${formoEvent.address} is in the blocked list`
      );
      return;
    }

    await this.eventQueue.enqueue(
      formoEvent,
      (err, _, data) => {
        if (err) {
          logger.error("Error sending events:", err);
        } else {
          logger.info(`Events sent successfully: ${(data as unknown[])?.length ?? 0} events`);
        }
        callback?.(err, _, data);
      },
      generation,
      { dedupKey, idempotencyKey }
    );
  }
}

export { EventManager };
