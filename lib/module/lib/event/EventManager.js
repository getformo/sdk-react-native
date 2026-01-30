import { logger } from "../logger";
import { EventFactory } from "./EventFactory";
import { isBlockedAddress } from "../../utils/address";

/**
 * Event manager for React Native SDK
 * Generates valid event payloads and queues them for processing
 */
class EventManager {
  constructor(eventQueue, options) {
    this.eventQueue = eventQueue;
    this.eventFactory = new EventFactory(options);
  }

  /**
   * Add event to queue
   */
  async addEvent(event, address, userId) {
    const {
      callback,
      ..._event
    } = event;
    const formoEvent = await this.eventFactory.create(_event, address, userId);

    // Check if the final event has a blocked address
    if (formoEvent.address && isBlockedAddress(formoEvent.address)) {
      logger.warn(`Event blocked: Address ${formoEvent.address} is in the blocked list`);
      return;
    }
    await this.eventQueue.enqueue(formoEvent, (err, _, data) => {
      if (err) {
        logger.error("Error sending events:", err);
      } else {
        logger.info(`Events sent successfully: ${data?.length ?? 0} events`);
      }
      callback?.(err, _, data);
    });
  }
}
export { EventManager };
//# sourceMappingURL=EventManager.js.map