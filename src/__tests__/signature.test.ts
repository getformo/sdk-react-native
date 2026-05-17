import { WagmiEventHandler } from "../lib/wagmi/WagmiEventHandler";

// A realistic 65-byte ECDSA signature (the replayable credential we must not leak).
const RAW_SIGNATURE = "0x" + "a".repeat(130);

// Build a WagmiEventHandler with the formo boundary mocked. The wagmi/query
// plumbing is external integration surface (unavoidable mock); the code under
// test — handleSignatureMutation — is exercised for real.
function makeHandler() {
  const signature = jest.fn().mockResolvedValue(undefined);
  const formo = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    chain: jest.fn(),
    signature,
    transaction: jest.fn(),
    isAutocaptureEnabled: jest.fn(() => true),
  };
  const wagmiConfig = { subscribe: () => () => {} };
  const handler = new WagmiEventHandler(formo as any, wagmiConfig as any);
  // Connection state is established elsewhere; inject it directly so we can
  // exercise the signature path in isolation.
  (handler as any).trackingState = {
    isProcessing: false,
    lastChainId: 1,
    lastAddress: "0x742d35cc6634c0532925a3b844bc9e7595f3f6d2",
  };
  const fire = (mutationType: "signMessage" | "signTypedData", state: any) =>
    (handler as any).handleSignatureMutation(mutationType, { state });
  return { signature, fire };
}

const flat = (obj: unknown) => JSON.stringify(obj);

describe("signature autocapture must never emit the raw signature", () => {
  it("signMessage: no signatureHash, no raw signature value", () => {
    const { signature, fire } = makeHandler();

    fire("signMessage", {
      status: "success",
      data: RAW_SIGNATURE,
      variables: { message: "hello" },
    });

    expect(signature).toHaveBeenCalledTimes(1);
    const arg = signature.mock.calls[0][0];
    expect(arg).not.toHaveProperty("signatureHash");
    expect(flat(arg)).not.toContain(RAW_SIGNATURE);
  });

  it("signTypedData: no signatureHash, no raw signature value", () => {
    const { signature, fire } = makeHandler();
    const permit = {
      domain: { name: "USD Coin", chainId: 1 },
      primaryType: "Permit",
      types: { Permit: [{ name: "owner", type: "address" }] },
      message: { owner: "0xVictim", spender: "0xRouter", value: "1", deadline: 9 },
    };

    fire("signTypedData", {
      status: "success",
      data: RAW_SIGNATURE,
      variables: permit,
    });

    const arg = signature.mock.calls[0][0];
    expect(arg).not.toHaveProperty("signatureHash");
    expect(flat(arg)).not.toContain(RAW_SIGNATURE);
  });
});
