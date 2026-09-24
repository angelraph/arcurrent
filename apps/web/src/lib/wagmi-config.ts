import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

/**
 * Arc mainnet, defined for the browser wallet flow specifically -- this is
 * deliberately hardcoded to mainnet (not network-aware like
 * getActiveArcNetwork() in packages/shared) because the whole point of this
 * flow is letting a stranger connect their own wallet and use the real,
 * permissionless MandateEscrow primitive with their own funds, not a
 * server-side setting. Values match packages/shared/src/chain.ts's
 * ARC_MAINNET, verified against docs.arc.io 2026-09-22.
 */
export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

/** Same fixed precompile address on every Arc network -- see chain.ts. */
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const USDC_DECIMALS = 6;

/**
 * MANDATE_ESCROW_ADDRESS itself is a server-only env var (packages/shared
 * reads it directly); this is the client-visible copy, since a wallet
 * connect flow runs entirely in the browser and needs the address to build
 * transactions. Not a secret -- it's a public contract address.
 */
export const MANDATE_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_MANDATE_ESCROW_ADDRESS as
  | `0x${string}`
  | undefined;

/** The treasury AgentVault. Public, like MANDATE_ESCROW_ADDRESS; the owner controls in the browser need it. */
export const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined;

export const wagmiConfig = createConfig({
  chains: [arcMainnet],
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http(),
  },
});
