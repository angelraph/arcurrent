import "dotenv/config";
import { getActiveArcNetwork, getCircleClient } from "@arcurrent/shared";

/**
 * One-time setup: creates a real Circle developer-controlled wallet for the
 * treasury, on whichever network ARC_NETWORK selects ("testnet" or
 * "mainnet" — see getActiveArcNetwork() in chain.ts). Run with
 * `npm run setup:wallet` after setting CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET
 * in .env. Prints the values to put into TREASURY_WALLET_ID /
 * TREASURY_WALLET_ADDRESS — this does not write .env for you, since it
 * shouldn't silently overwrite an existing wallet (testnet or mainnet).
 */
async function main() {
  const network = getActiveArcNetwork();
  const circle = getCircleClient();

  const walletSetRes = await circle.createWalletSet({
    name: `arcurrent-treasury-${network.circleBlockchainId.toLowerCase()}`,
  });
  const walletSetId = walletSetRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error("createWalletSet did not return a wallet set id");
  console.log(`Created wallet set: ${walletSetId}`);

  const walletsRes = await circle.createWallets({
    blockchains: [network.circleBlockchainId],
    count: 1,
    walletSetId,
  });
  const wallet = walletsRes.data?.wallets?.[0];
  if (!wallet) throw new Error("createWallets did not return a wallet");

  console.log(`\nTreasury wallet created on ${network.name}. Add these to .env:\n`);
  console.log(`TREASURY_WALLET_ID=${wallet.id}`);
  console.log(`TREASURY_WALLET_ADDRESS=${wallet.address}`);
  if (network.faucet) {
    console.log(`\nFund it via the faucet (select ${network.name}): ${network.faucet} -> ${wallet.address}`);
  } else {
    console.log(`\nFund it with real USDC on ${network.name} -> ${wallet.address}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
