import "dotenv/config";
import { getCircleClient } from "@arcurrent/shared";

/**
 * One-time setup: creates a real Circle developer-controlled wallet on Base
 * Sepolia to act as the agent's cross-chain liquidity source. When the
 * treasury's Arc balance would breach the reserve floor, the agent bridges
 * USDC from this wallet into the treasury via CCTP (see
 * packages/shared/src/liquidity.ts) instead of just flagging the shortfall.
 * Run with `npm run setup:liquidity-wallet` after CIRCLE_API_KEY and
 * CIRCLE_ENTITY_SECRET are set in .env. Prints the values to put into
 * LIQUIDITY_WALLET_ID / LIQUIDITY_WALLET_ADDRESS — does not write .env for
 * you, since it shouldn't silently overwrite an existing wallet.
 */
async function main() {
  const circle = getCircleClient();

  const walletSetRes = await circle.createWalletSet({ name: "arcurrent-liquidity" });
  const walletSetId = walletSetRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error("createWalletSet did not return a wallet set id");
  console.log(`Created wallet set: ${walletSetId}`);

  const walletsRes = await circle.createWallets({
    blockchains: ["BASE-SEPOLIA"],
    count: 1,
    walletSetId,
  });
  const wallet = walletsRes.data?.wallets?.[0];
  if (!wallet) throw new Error("createWallets did not return a wallet");

  console.log("\nLiquidity wallet created on Base Sepolia. Add these to .env:\n");
  console.log(`LIQUIDITY_WALLET_ID=${wallet.id}`);
  console.log(`LIQUIDITY_WALLET_ADDRESS=${wallet.address}`);
  console.log(
    `\nFund it via the faucet (select Base Sepolia): https://faucet.circle.com -> ${wallet.address}\n` +
      `Needs BOTH testnet ETH (gas for the CCTP burn call) and USDC (the amount to bridge) — ` +
      `confirmed the faucet does NOT always grant both in one request, so request each explicitly ` +
      `and verify the wallet's native ETH balance before relying on this (a USDC-only balance makes ` +
      `kit.bridge() hang rather than fail — see liquidity.ts's timeout guard).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
