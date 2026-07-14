import "dotenv/config";
import { getCircleClient } from "@arcurrent/shared";

/**
 * One-time setup: creates a real Circle developer-controlled wallet on Arc
 * Testnet for the treasury. Run with `npm run setup:wallet` after setting
 * CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in .env. Prints the values to put
 * into TREASURY_WALLET_ID / TREASURY_WALLET_ADDRESS — this does not write
 * .env for you, since it shouldn't silently overwrite an existing wallet.
 */
async function main() {
  const circle = getCircleClient();

  const walletSetRes = await circle.createWalletSet({ name: "arcurrent-treasury" });
  const walletSetId = walletSetRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error("createWalletSet did not return a wallet set id");
  console.log(`Created wallet set: ${walletSetId}`);

  const walletsRes = await circle.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: 1,
    walletSetId,
  });
  const wallet = walletsRes.data?.wallets?.[0];
  if (!wallet) throw new Error("createWallets did not return a wallet");

  console.log("\nTreasury wallet created on Arc Testnet. Add these to .env:\n");
  console.log(`TREASURY_WALLET_ID=${wallet.id}`);
  console.log(`TREASURY_WALLET_ADDRESS=${wallet.address}`);
  console.log(
    `\nFund it via the faucet (select Arc Testnet): https://faucet.circle.com -> ${wallet.address}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
