import {
  Address,
  APIEvent,
  IFormoEvent,
  IFormoEventContext,
  IFormoEventProperties,
  Nullable,
  SignatureStatus,
  TransactionStatus,
  ChainID,
} from "../../types";

export interface IEventFactory {
  create(
    event: APIEvent,
    address?: Address,
    userId?: string
  ): Promise<IFormoEvent>;

  generateScreenEvent(
    name: string,
    category?: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;

  generateDetectWalletEvent(
    providerName: string,
    rdns: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;

  generateIdentifyEvent(
    providerName: string,
    rdns: string,
    address: Nullable<Address>,
    userId?: Nullable<string>,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;

  generateConnectEvent(
    chainId: ChainID,
    address: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;

  generateDisconnectEvent(
    chainId?: ChainID,
    address?: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;

  generateChainChangedEvent(
    chainId: ChainID,
    address: Address,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;

  generateSignatureEvent(
    status: SignatureStatus,
    chainId: ChainID | undefined,
    address: Address,
    message: string,
    signatureHash?: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;

  generateTransactionEvent(
    status: TransactionStatus,
    chainId: ChainID,
    address: Address,
    data?: string,
    to?: string,
    value?: string,
    transactionHash?: string,
    function_name?: string,
    function_args?: Record<string, unknown>,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;

  generateTrackEvent(
    event: string,
    properties?: IFormoEventProperties,
    context?: IFormoEventContext
  ): Promise<IFormoEvent>;
}

export interface IEventManager {
  addEvent(event: APIEvent, address?: Address, userId?: string): Promise<void>;
}

export interface IEventQueue {
  enqueue(
    event: IFormoEvent,
    callback?: (...args: unknown[]) => void
  ): Promise<void>;
  flush(callback?: (...args: unknown[]) => void): Promise<void>;
  clear(): void;
  cleanup(): Promise<void>;
}
