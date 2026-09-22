/**
 * Arc Testnet network config.
 * Verified against docs.arc.io/arc/references/connect-to-arc and chainlist.org/chain/5042002
 * (2026-07-14). Re-check before mainnet migration.
 */
export const ARC_TESTNET = {
  chainId: 5042002,
  name: "Arc Testnet",
  rpcUrls: {
    default: "https://rpc.testnet.arc.network",
    blockdaemon: "https://rpc.blockdaemon.testnet.arc.network",
    drpc: "https://rpc.drpc.testnet.arc.network",
    quicknode: "https://rpc.quicknode.testnet.arc.network",
  },
  blockExplorer: "https://testnet.arcscan.app",
  faucet: "https://faucet.circle.com",
  /** Native gas token is USDC, but exposed with 18 decimals at the protocol level. */
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  /**
   * ERC-20 view of USDC — use this interface for all balance reads and transfers.
   * Do not mix with the 18-decimal native/gas view.
   */
  usdcErc20Address: "0x3600000000000000000000000000000000000000" as const,
  usdcErc20Decimals: 6,
  /**
   * Circle's own token identifier for USDC on ARC-TESTNET, required by
   * `createTransaction` (tokenAddress alone is rejected with "API parameter
   * invalid" — Circle's transfer endpoint requires `tokenId` OR `blockchain`,
   * confirmed against the live API on 2026-07-14). Resolved via a
   * `getWalletTokenBalance` call; stable across wallets since it's derived
   * from the (blockchain, tokenAddress) pair, not account-specific.
   */
  usdcTokenId: "ef87c8c3-85de-598a-af50-c5135eecfa74" as const,
  /** CCTP domain ID for Arc — used by Bridge Kit when routing cross-chain transfers. */
  cctpDomainId: 26,
} as const;

/**
 * Arc Mainnet network config.
 * Chain ID, RPC URLs (naming pattern matches testnet's per-provider subdomains),
 * block explorer, native currency, and the USDC ERC-20 precompile address (the
 * same fixed 0x3600... address as testnet) verified against docs.arc.io/arc/
 * references/connect-to-arc on 2026-09-22.
 *
 * NOT yet verified — fill in before a real mainnet deploy, the same way
 * usdcTokenId below was resolved on testnet:
 * - `usdcTokenId`: Circle's internal token id for USDC on Arc Mainnet. Create
 *   the mainnet treasury wallet first, then read it off a
 *   `getWalletTokenBalance` response rather than guessing.
 * - `cctpDomainId`: not published in the docs page checked; confirm with
 *   Circle's CCTP domain reference before wiring Bridge Kit to mainnet.
 * - Circle's `blockchain` enum value for mainnet wallet creation (whatever
 *   replaces `"ARC-TESTNET"`) — check developers.circle.com/wallets docs or
 *   the API's accepted-values error message directly.
 *
 * A third-party report (github.com/circlefin/arc-node issue #454, unofficial)
 * notes the public mainnet RPC load-balances across backends with
 * inconsistent chain heads (occasional -32014 errors) and caps eth_getLogs at
 * ~10,000 blocks — the same class of flakiness the fallback transport below
 * already exists to survive on testnet; treat retries as normal, not fatal.
 */
export const ARC_MAINNET = {
  chainId: 5042,
  name: "Arc Mainnet",
  rpcUrls: {
    default: "https://rpc.mainnet.arc.io",
    blockdaemon: "https://rpc.blockdaemon.mainnet.arc.io",
    drpc: "https://rpc.drpc.mainnet.arc.io",
    quicknode: "https://rpc.quicknode.mainnet.arc.io",
  },
  blockExplorer: "https://explorer.arc.io",
  faucet: null,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  usdcErc20Address: "0x3600000000000000000000000000000000000000" as const,
  usdcErc20Decimals: 6,
  /** TODO: resolve via getWalletTokenBalance against the mainnet treasury wallet — do not guess. */
  usdcTokenId: null as string | null,
  /** TODO: confirm against Circle's CCTP domain reference before mainnet Bridge Kit use. */
  cctpDomainId: null as number | null,
} as const;

/**
 * Shape shared by both networks, widened from the individual `as const`
 * literals above — ARC_TESTNET and ARC_MAINNET differ in field values (e.g.
 * `faucet` is a URL on testnet, `null` on mainnet, since mainnet USDC isn't
 * free) but both satisfy this.
 */
export interface ArcNetworkConfig {
  chainId: number;
  name: string;
  rpcUrls: { default: string; blockdaemon: string; drpc: string; quicknode: string };
  blockExplorer: string;
  faucet: string | null;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  usdcErc20Address: `0x${string}`;
  usdcErc20Decimals: number;
  usdcTokenId: string | null;
  cctpDomainId: number | null;
}

/**
 * Selects the active network from `ARC_NETWORK` ("testnet" | "mainnet"),
 * defaulting to testnet so existing local dev / CI keeps working unchanged
 * until this is deliberately opted into mainnet.
 */
export function getActiveArcNetwork(): ArcNetworkConfig {
  const selector = process.env.ARC_NETWORK ?? "testnet";
  if (selector === "mainnet") return ARC_MAINNET;
  if (selector === "testnet") return ARC_TESTNET;
  throw new Error(`Unknown ARC_NETWORK "${selector}" — expected "testnet" or "mainnet".`);
}
