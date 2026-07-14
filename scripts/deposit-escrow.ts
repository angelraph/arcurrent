import { config } from "dotenv";
config({ path: ".env" });
import { getCircleClient } from "@arcurrent/shared";

async function main() {
  const escrowAddress = process.argv[2];
  const amountUsdc = process.argv[3];
  if (!escrowAddress || !amountUsdc) {
    throw new Error("Usage: tsx scripts/deposit-escrow.ts <escrowAddress> <amountUsdc>");
  }
  const walletId = process.env.TREASURY_WALLET_ID!;
  const amountAtomic = String(Math.round(Number(amountUsdc) * 1_000_000));

  const circle = getCircleClient();
  const res = await circle.createContractExecutionTransaction({
    walletId,
    contractAddress: escrowAddress,
    abiFunctionSignature: "deposit(uint256)",
    abiParameters: [amountAtomic],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  console.log("deposit tx id:", res.data?.id, "state:", res.data?.state);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
