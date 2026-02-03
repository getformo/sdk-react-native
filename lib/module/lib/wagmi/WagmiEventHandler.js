/**
 * WagmiEventHandler for React Native
 *
 * Handles wallet event tracking by hooking into Wagmi v2's config.subscribe()
 * and TanStack Query's MutationCache.
 */

import { SignatureStatus, TransactionStatus } from "../../types/events";
import { logger } from "../logger";

// Interface for FormoAnalytics to avoid circular dependency

export class WagmiEventHandler {
  unsubscribers = [];
  trackingState = {
    isProcessing: false
  };
  processedMutations = new Set();
  pendingStatusChanges = [];
  constructor(formoAnalytics, wagmiConfig, queryClient) {
    this.formo = formoAnalytics;
    this.wagmiConfig = wagmiConfig;
    this.queryClient = queryClient;
    logger.info("WagmiEventHandler: Initializing Wagmi integration");
    this.setupConnectionListeners();
    if (this.queryClient) {
      this.setupMutationTracking();
    } else {
      logger.warn("WagmiEventHandler: QueryClient not provided, signature and transaction events will not be tracked");
    }
  }

  /**
   * Set up listeners for wallet connection, disconnection, and chain changes
   */
  setupConnectionListeners() {
    logger.info("WagmiEventHandler: Setting up connection listeners");

    // Subscribe to status changes
    const statusUnsubscribe = this.wagmiConfig.subscribe(state => state.status, (status, prevStatus) => {
      this.handleStatusChange(status, prevStatus);
    });
    this.unsubscribers.push(statusUnsubscribe);

    // Subscribe to chain ID changes
    const chainIdUnsubscribe = this.wagmiConfig.subscribe(state => state.chainId, (chainId, prevChainId) => {
      this.handleChainChange(chainId, prevChainId);
    });
    this.unsubscribers.push(chainIdUnsubscribe);
    logger.info("WagmiEventHandler: Connection listeners set up successfully");
  }

  // Maximum pending status changes to prevent unbounded queue growth
  static MAX_PENDING_STATUS_CHANGES = 10;

  /**
   * Handle status changes (connect/disconnect)
   */
  async handleStatusChange(status, prevStatus) {
    if (this.trackingState.isProcessing) {
      // Limit queue size to prevent unbounded growth during rapid status changes
      if (this.pendingStatusChanges.length >= WagmiEventHandler.MAX_PENDING_STATUS_CHANGES) {
        logger.warn("WagmiEventHandler: Pending status change queue full, dropping oldest");
        this.pendingStatusChanges.shift();
      }
      // Queue status change to process after current one completes
      this.pendingStatusChanges.push({
        status,
        prevStatus
      });
      logger.debug("WagmiEventHandler: Queuing status change for later processing");
      return;
    }
    this.trackingState.isProcessing = true;
    try {
      // Process current status change
      await this.processStatusChange(status, prevStatus);

      // Process pending status changes iteratively (inline, no recursion)
      while (this.pendingStatusChanges.length > 0) {
        const pending = this.pendingStatusChanges.shift();
        await this.processStatusChange(pending.status, pending.prevStatus);
      }
    } finally {
      this.trackingState.isProcessing = false;
    }
  }

  /**
   * Process a single status change (extracted for iterative processing)
   */
  async processStatusChange(status, prevStatus) {
    try {
      const state = this.getState();
      const address = this.getConnectedAddress(state);
      const chainId = state.chainId;
      logger.info("WagmiEventHandler: Status changed", {
        status,
        prevStatus,
        address,
        chainId
      });

      // Handle disconnect
      if (status === "disconnected" && prevStatus === "connected") {
        if (this.formo.isAutocaptureEnabled("disconnect")) {
          await this.formo.disconnect({
            chainId: this.trackingState.lastChainId,
            address: this.trackingState.lastAddress
          });
        }
        this.trackingState.lastAddress = undefined;
        this.trackingState.lastChainId = undefined;
      }

      // Handle connect
      if (status === "connected" && prevStatus !== "connected") {
        if (address && chainId !== undefined) {
          this.trackingState.lastAddress = address;
          this.trackingState.lastChainId = chainId;
          if (this.formo.isAutocaptureEnabled("connect")) {
            const connectorName = this.getConnectorName(state);
            const connectorId = this.getConnectorId(state);
            await this.formo.connect({
              chainId,
              address
            }, {
              ...(connectorName && {
                providerName: connectorName
              }),
              // Connector ID is typically the rdns for EIP-6963 wallets
              ...(connectorId && {
                rdns: connectorId
              })
            });
          }
        }
      }
      this.trackingState.lastStatus = status;
    } catch (error) {
      logger.error("WagmiEventHandler: Error handling status change:", error);
    }
  }

  /**
   * Handle chain ID changes
   */
  async handleChainChange(chainId, prevChainId) {
    // Skip if no change, chainId is undefined, or this is initial connection (prevChainId undefined)
    if (chainId === prevChainId || chainId === undefined || prevChainId === undefined) {
      return;
    }
    const state = this.getState();
    if (state.status !== "connected") {
      return;
    }
    const address = this.getConnectedAddress(state);
    if (!address) {
      logger.warn("WagmiEventHandler: Chain changed but no address found");
      return;
    }
    logger.info("WagmiEventHandler: Chain changed", {
      chainId,
      prevChainId,
      address
    });
    this.trackingState.lastChainId = chainId;
    if (this.formo.isAutocaptureEnabled("chain")) {
      try {
        await this.formo.chain({
          chainId,
          address
        });
      } catch (error) {
        logger.error("WagmiEventHandler: Error tracking chain change:", error);
      }
    }
  }

  /**
   * Set up mutation tracking for signatures and transactions
   */
  setupMutationTracking() {
    if (!this.queryClient) {
      return;
    }
    logger.info("WagmiEventHandler: Setting up mutation tracking");
    const mutationCache = this.queryClient.getMutationCache();
    const unsubscribe = mutationCache.subscribe(event => {
      this.handleMutationEvent(event);
    });
    this.unsubscribers.push(unsubscribe);
    logger.info("WagmiEventHandler: Mutation tracking set up successfully");
  }

  /**
   * Handle mutation cache events
   */
  handleMutationEvent(event) {
    if (event.type !== "updated") {
      return;
    }
    const mutation = event.mutation;
    const mutationKey = mutation.options.mutationKey;
    if (!mutationKey || mutationKey.length === 0) {
      return;
    }
    const mutationType = mutationKey[0];
    const state = mutation.state;
    const mutationStateKey = `${mutation.mutationId}:${state.status}`;
    if (this.processedMutations.has(mutationStateKey)) {
      return;
    }
    this.processedMutations.add(mutationStateKey);
    logger.debug("WagmiEventHandler: Mutation event", {
      mutationType,
      mutationId: mutation.mutationId,
      status: state.status
    });
    if (mutationType === "signMessage" || mutationType === "signTypedData") {
      this.handleSignatureMutation(mutationType, mutation);
    }
    if (mutationType === "sendTransaction" || mutationType === "writeContract") {
      this.handleTransactionMutation(mutationType, mutation);
    }

    // Cleanup old mutations
    if (this.processedMutations.size > 1000) {
      const entries = Array.from(this.processedMutations);
      for (let i = 0; i < 500; i++) {
        const entry = entries[i];
        if (entry) {
          this.processedMutations.delete(entry);
        }
      }
    }
  }

  /**
   * Handle signature mutations
   */
  handleSignatureMutation(mutationType, mutation) {
    if (!this.formo.isAutocaptureEnabled("signature")) {
      return;
    }
    const state = mutation.state;
    const variables = state.variables || {};
    const chainId = this.trackingState.lastChainId;
    const address = this.trackingState.lastAddress;
    if (!address) {
      logger.warn("WagmiEventHandler: Signature event but no address available");
      return;
    }
    if (!chainId || chainId === 0) {
      logger.warn("WagmiEventHandler: Signature event but no valid chainId available");
      return;
    }
    try {
      let status;
      let signatureHash;
      if (state.status === "pending") {
        status = SignatureStatus.REQUESTED;
      } else if (state.status === "success") {
        status = SignatureStatus.CONFIRMED;
        signatureHash = state.data;
      } else if (state.status === "error") {
        status = SignatureStatus.REJECTED;
      } else {
        return;
      }
      let message;
      if (mutationType === "signMessage") {
        message = variables.message || "";
      } else {
        message = JSON.stringify(variables.message || variables.types || {});
      }
      logger.info("WagmiEventHandler: Tracking signature event", {
        status,
        mutationType,
        address,
        chainId
      });
      this.formo.signature({
        status,
        chainId,
        address,
        message,
        ...(signatureHash && {
          signatureHash
        })
      }).catch(error => {
        logger.error("WagmiEventHandler: Error tracking signature:", error);
      });
    } catch (error) {
      logger.error("WagmiEventHandler: Error handling signature mutation:", error);
    }
  }

  /**
   * Handle transaction mutations
   */
  handleTransactionMutation(mutationType, mutation) {
    if (!this.formo.isAutocaptureEnabled("transaction")) {
      return;
    }
    const state = mutation.state;
    const variables = state.variables || {};
    const chainId = this.trackingState.lastChainId || variables.chainId;
    // Only use variables.account as fallback, not variables.address which is the contract address
    const address = this.trackingState.lastAddress || variables.account;
    if (!address) {
      logger.warn("WagmiEventHandler: Transaction event but no address available");
      return;
    }
    if (!chainId || chainId === 0) {
      logger.warn("WagmiEventHandler: Transaction event but no valid chainId available");
      return;
    }
    try {
      let status;
      let transactionHash;
      if (state.status === "pending") {
        status = TransactionStatus.STARTED;
      } else if (state.status === "success") {
        status = TransactionStatus.BROADCASTED;
        transactionHash = state.data;
      } else if (state.status === "error") {
        status = TransactionStatus.REJECTED;
      } else {
        return;
      }
      const data = variables.data;
      const to = variables.to || variables.address;
      const value = variables.value?.toString();
      logger.info("WagmiEventHandler: Tracking transaction event", {
        status,
        mutationType,
        address,
        chainId,
        transactionHash
      });
      this.formo.transaction({
        status,
        chainId,
        address,
        ...(data && {
          data
        }),
        ...(to && {
          to
        }),
        ...(value && {
          value
        }),
        ...(transactionHash && {
          transactionHash
        })
      }).catch(error => {
        logger.error("WagmiEventHandler: Error tracking transaction:", error);
      });
    } catch (error) {
      logger.error("WagmiEventHandler: Error handling transaction mutation:", error);
    }
  }

  /**
   * Get current Wagmi state
   */
  getState() {
    if (typeof this.wagmiConfig.getState === "function") {
      return this.wagmiConfig.getState();
    }
    if (this.wagmiConfig.state) {
      return this.wagmiConfig.state;
    }
    logger.warn("WagmiEventHandler: Unable to get state from config, returning default state");
    return {
      status: "disconnected",
      connections: new Map(),
      current: undefined,
      chainId: undefined
    };
  }

  /**
   * Get connected address from state
   */
  getConnectedAddress(state) {
    if (!state.current) {
      return undefined;
    }
    const connection = state.connections.get(state.current);
    if (!connection || connection.accounts.length === 0) {
      return undefined;
    }
    return connection.accounts[0];
  }

  /**
   * Get connector name from state
   */
  getConnectorName(state) {
    if (!state.current) {
      return undefined;
    }
    const connection = state.connections.get(state.current);
    return connection?.connector.name;
  }

  /**
   * Get connector ID from state (typically the rdns for EIP-6963 wallets)
   */
  getConnectorId(state) {
    if (!state.current) {
      return undefined;
    }
    const connection = state.connections.get(state.current);
    return connection?.connector.id;
  }

  /**
   * Clean up subscriptions
   */
  cleanup() {
    logger.info("WagmiEventHandler: Cleaning up subscriptions");
    for (const unsubscribe of this.unsubscribers) {
      try {
        unsubscribe();
      } catch (error) {
        logger.error("WagmiEventHandler: Error during cleanup:", error);
      }
    }
    this.unsubscribers = [];
    this.processedMutations.clear();
    this.pendingStatusChanges = [];
    logger.info("WagmiEventHandler: Cleanup complete");
  }
}
//# sourceMappingURL=WagmiEventHandler.js.map