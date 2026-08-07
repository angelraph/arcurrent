import { config } from "dotenv";
config({ path: ".env" });
import { depositToEscrow } from "@arcurrent/shared";

const ESCROW_ADDRESS = process.argv[2];
const AMOUNT_USDC = process.argv[3];

/**
 * Thin CLI wrapper around depositToEscrow() -- this used to duplicate the
 * approve+deposit logic with its own fixed 8s sleep between the two calls,
 * the same race condition fixed in circle.ts's depositToEscrow (a real
 * confirmation poll, not a guess). Reusing the shared, already-fixed
 * function instead of keeping a second, stale copy of the same bug around.
 */
async function main() {
  if (!ESCROW_ADDRESS || !AMOUNT_USDC) {
    throw new Error("Usage: tsx scripts/fund-escrow.ts <escrowAddress> <amountUsdc>");
  }
  const walletId = process.env.TREASURY_WALLET_ID;
  if (!walletId) throw new Error("TREASURY_WALLET_ID must be set.");

  console.log(`Funding escrow ${ESCROW_ADDRESS} with ${AMOUNT_USDC} USDC...`);
  const { approveTransactionId, depositTransactionId } = await depositToEscrow({
    walletId,
    escrowAddress: ESCROW_ADDRESS,
    amountUsdc: Number(AMOUNT_USDC),
  });
  console.log("approve tx id:", approveTransactionId);
  console.log("deposit tx id:", depositTransactionId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
