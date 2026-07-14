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
  /** CCTP domain ID for Arc — used by Bridge Kit when routing cross-chain transfers. */
  cctpDomainId: 26,
} as const;
