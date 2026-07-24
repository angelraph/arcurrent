import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BridgeChain } from "@circle-fin/app-kit";
import { evaluatePendingObligations } from "@arcurrent/shared";

// Monorepo root .env — dotenv/config alone loads from this workspace's own
// directory (apps/agent), not the workspace root where the shared .env lives.
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function main() {
  const walletId = process.env.TREASURY_WALLET_ID;
  if (!walletId) {
    throw new Error("TREASURY_WALLET_ID is not set — run the wallet setup step first.");
  }
  const escrowAddress = process.env.OBLIGATION_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!escrowAddress) {
    throw new Error("OBLIGATION_ESCROW_ADDRESS is not set — deploy the escrow contract first.");
  }

  const walletAddress = process.env.TREASURY_WALLET_ADDRESS;
  if (!walletAddress) {
    throw new Error("TREASURY_WALLET_ADDRESS is not set — run the wallet setup step first.");
  }

  const oracleUrl = process.env.ORACLE_URL;
  const x402Key = process.env.AGENT_X402_PRIVATE_KEY as `0x${string}` | undefined;

  const liquiditySourceAddress = process.env.LIQUIDITY_WALLET_ADDRESS;

  const summary = await evaluatePendingObligations({
    walletId,
    walletAddress,
    escrowAddress,
    reserveThresholdUsdc: Number(process.env.TREASURY_RESERVE_USDC ?? "0"),
    payAheadWindowDays: Number(process.env.AGENT_PAY_AHEAD_WINDOW_DAYS ?? "3"),
    oracle: oracleUrl && x402Key ? { url: oracleUrl, privateKey: x402Key } : undefined,
    liquidity: liquiditySourceAddress
      ? { sourceChain: BridgeChain.Base_Sepolia, sourceAddress: liquiditySourceAddress }
      : undefined,
  });

  console.log(
    summary.evaluated === 0
      ? "No pending obligations."
      : `Evaluated ${summary.evaluated} obligation(s): ${JSON.stringify(summary.actions)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
