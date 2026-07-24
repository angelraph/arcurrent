import { BridgeChain } from "@circle-fin/app-kit";
import type { EvaluateConfig } from "@arcurrent/shared";

/**
 * Builds the evaluatePendingObligations() config from env vars — shared
 * between the Vercel Cron route and the "add obligation" server action so
 * there's exactly one place that reads these variables.
 */
export function getEvaluateConfigFromEnv(): EvaluateConfig | { error: string } {
  const walletId = process.env.TREASURY_WALLET_ID;
  const walletAddress = process.env.TREASURY_WALLET_ADDRESS;
  const escrowAddress = process.env.OBLIGATION_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!walletId || !walletAddress || !escrowAddress) {
    return { error: "TREASURY_WALLET_ID, TREASURY_WALLET_ADDRESS, and OBLIGATION_ESCROW_ADDRESS must be set" };
  }

  const oracleUrl = process.env.ORACLE_URL;
  const x402Key = process.env.AGENT_X402_PRIVATE_KEY as `0x${string}` | undefined;
  const liquiditySourceAddress = process.env.LIQUIDITY_WALLET_ADDRESS;

  return {
    walletId,
    walletAddress,
    escrowAddress,
    reserveThresholdUsdc: Number(process.env.TREASURY_RESERVE_USDC ?? "0"),
    payAheadWindowDays: Number(process.env.AGENT_PAY_AHEAD_WINDOW_DAYS ?? "3"),
    oracle: oracleUrl && x402Key ? { url: oracleUrl, privateKey: x402Key } : undefined,
    liquidity: liquiditySourceAddress
      ? { sourceChain: BridgeChain.Base_Sepolia, sourceAddress: liquiditySourceAddress }
      : undefined,
  };
}
