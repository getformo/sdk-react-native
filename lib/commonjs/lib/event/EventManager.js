"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventManager = void 0;
var _logger = require("../logger");
var _EventFactory = require("./EventFactory");
var _address = require("../../utils/address");
/**
 * Event manager for React Native SDK
 * Generates valid event payloads and queues them for processing
 */
class EventManager {
  constructor(eventQueue, options) {
    this.eventQueue = eventQueue;
    this.eventFactory = new _EventFactory.EventFactory(options);
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
    if (formoEvent.address && (0, _address.isBlockedAddress)(formoEvent.address)) {
      _logger.logger.warn(`Event blocked: Address ${formoEvent.address} is in the blocked list`);
      return;
    }
    await this.eventQueue.enqueue(formoEvent, (err, _, data) => {
      if (err) {
        _logger.logger.error("Error sending events:", err);
      } else {
        _logger.logger.info(`Events sent successfully: ${data?.length ?? 0} events`);
      }
      callback?.(err, _, data);
    });
  }
}
exports.EventManager = EventManager;
//# sourceMappingURL=EventManager.js.map