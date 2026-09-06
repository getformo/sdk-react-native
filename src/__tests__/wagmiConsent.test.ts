import { WagmiEventHandler } from "../lib/wagmi/WagmiEventHandler";

const address = "0x742d35cc6634c0532925a3b844bc9e7595f3f6d2";

function makeHandler(optedOut: () => boolean) {
  const formo = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    chain: jest.fn().mockResolvedValue(undefined),
    signature: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn().mockResolvedValue(undefined),
    isAutocaptureEnabled: jest.fn(() => true),
    hasOptedOutTracking: optedOut,
  };
  const state = {
    status: "connected",
    chainId: 1,
    current: "wallet",
    connections: new Map([
      [
        "wallet",
        {
          accounts: [address],
          connector: { id: "io.metamask", name: "MetaMask" },
        },
      ],
    ]),
  };
  const wagmiConfig = {
    subscribe: () => () => {},
    getState: () => state,
  };
  return {
    formo,
    handler: new WagmiEventHandler(formo, wagmiConfig as any),
  };
}

describe("Wagmi consent boundary", () => {
  it("does not cache a wallet while opted out", async () => {
    const { formo, handler } = makeHandler(() => true);

    await (handler as any).processStatusChange("connected", "connecting");

    expect(formo.connect).not.toHaveBeenCalled();
    expect((handler as any).trackingState.lastAddress).toBeUndefined();
    expect((handler as any).trackingState.lastChainId).toBeUndefined();
  });

  it("clears the cached wallet at reset", async () => {
    const { handler } = makeHandler(() => false);
    await (handler as any).processStatusChange("connected", "connecting");

    handler.clearIdentity();

    expect((handler as any).trackingState.lastAddress).toBeUndefined();
    expect((handler as any).trackingState.lastChainId).toBeUndefined();
  });

  it("drops status changes queued before reset", async () => {
    const { formo, handler } = makeHandler(() => false);
    let release!: () => void;
    formo.connect.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );

    const processing = (handler as any).handleStatusChange(
      "connected",
      "connecting"
    );
    await Promise.resolve();
    await (handler as any).handleStatusChange("connected", "disconnected");

    handler.clearIdentity();
    release();
    await processing;

    expect(formo.connect).toHaveBeenCalledTimes(1);
    expect((handler as any).trackingState.lastAddress).toBeUndefined();
    expect((handler as any).trackingState.lastChainId).toBeUndefined();
  });

  it("rejects status changes received while opted out", async () => {
    let optedOut = false;
    const { formo, handler } = makeHandler(() => optedOut);
    let release!: () => void;
    formo.connect.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );

    const processing = (handler as any).handleStatusChange(
      "connected",
      "connecting"
    );
    await Promise.resolve();
    optedOut = true;
    handler.clearIdentity();
    await (handler as any).handleStatusChange("connected", "reconnecting");
    optedOut = false;
    release();
    await processing;

    expect(formo.connect).toHaveBeenCalledTimes(1);
    expect((handler as any).trackingState.lastAddress).toBeUndefined();
    expect((handler as any).trackingState.lastChainId).toBeUndefined();
  });
});
