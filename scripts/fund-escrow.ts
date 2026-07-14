import { config } from "dotenv";
config({ path: ".env" });
import { getCircleClient } from "@arcurrent/shared";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ESCROW_ADDRESS = process.argv[2];
const AMOUNT_USDC = process.argv[3];

async function main() {
  if (!ESCROW_ADDRESS || !AMOUNT_USDC) {
    throw new Error("Usage: tsx scripts/fund-escrow.ts <escrowAddress> <amountUsdc>");
  }
  const walletId = process.env.TREASURY_WALLET_ID;
  if (!walletId) throw new Error("TREASURY_WALLET_ID must be set.");

  const amountAtomic = String(Math.round(Number(AMOUNT_USDC) * 1_000_000));
  const circle = getCircleClient();

  console.log(`Approving escrow to pull ${AMOUNT_USDC} USDC (${amountAtomic} atomic units)...`);
  const approveRes = await circle.createContractExecutionTransaction({
    walletId,
    contractAddress: USDC_ADDRESS,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [ESCROW_ADDRESS, amountAtomic],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  console.log("approve tx id:", approveRes.data?.id, "state:", approveRes.data?.state);

  // Wait for the approve to actually land before depositing, or the ERC20
  // allowance won't be set yet when the deposit call executes.
  await new Promise((r) => setTimeout(r, 8000));

  console.log(`Depositing ${AMOUNT_USDC} USDC into escrow...`);
  const depositRes = await circle.createContractExecutionTransaction({
    walletId,
    contractAddress: ESCROW_ADDRESS,
    abiFunctionSignature: "deposit(uint256)",
    abiParameters: [amountAtomic],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  console.log("deposit tx id:", depositRes.data?.id, "state:", depositRes.data?.state);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
