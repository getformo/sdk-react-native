import { Address, APIEvent, ChainID, IFormoEvent, IFormoEventContext, IFormoEventProperties, Nullable, Options, SignatureStatus, TransactionStatus } from "../../types";
import { IEventFactory } from "./types";
/**
 * Event factory for React Native
 * Creates event payloads with mobile-specific context
 */
declare class EventFactory implements IEventFactory {
    private options?;
    constructor(options?: Options);
    /**
     * Get device timezone
     */
    private getTimezone;
    /**
     * Get location from timezone
     */
    private getLocation;
    /**
     * Get device language/locale
     */
    private getLanguage;
    /**
     * Get screen dimensions
     */
    private getScreen;
    /**
     * Get device information
     */
    private getDeviceInfo;
    /**
     * Generate context with mobile-specific metadata
     */
    private generateContext;
    /**
     * Create enriched event with common properties
     */
    private getEnrichedEvent;
    /**
     * Generate screen view event (mobile equivalent of page)
     */
    generateScreenEvent(name: string, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    generateDetectWalletEvent(providerName: string, rdns: string, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    generateIdentifyEvent(providerName: string, rdns: string, address: Nullable<Address>, userId?: Nullable<string>, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    generateConnectEvent(chainId: ChainID, address: Address, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    generateDisconnectEvent(chainId?: ChainID, address?: Address, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    generateChainChangedEvent(chainId: ChainID, address: Address, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    generateSignatureEvent(status: SignatureStatus, chainId: ChainID, address: Address, message: string, signatureHash?: string, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    generateTransactionEvent(status: TransactionStatus, chainId: ChainID, address: Address, data: string, to: string, value: string, transactionHash?: string, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    generateTrackEvent(event: string, properties?: IFormoEventProperties, context?: IFormoEventContext): Promise<IFormoEvent>;
    /**
     * Create event from API event type
     */
    create(event: APIEvent, address?: Address, userId?: string): Promise<IFormoEvent>;
}
export { EventFactory };
//# sourceMappingURL=EventFactory.d.ts.map