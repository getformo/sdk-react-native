import { Address, APIEvent, Options } from "../../types";
import { IEventFactory, IEventManager, IEventQueue } from "./types";
/**
 * Event manager for React Native SDK
 * Generates valid event payloads and queues them for processing
 */
declare class EventManager implements IEventManager {
    eventQueue: IEventQueue;
    eventFactory: IEventFactory;
    constructor(eventQueue: IEventQueue, options?: Options);
    /**
     * Add event to queue
     */
    addEvent(event: APIEvent, address?: Address, userId?: string): Promise<void>;
}
export { EventManager };
//# sourceMappingURL=EventManager.d.ts.map