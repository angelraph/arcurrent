import { config } from "dotenv";
config({ path: ".env" });
import { GatewayClient } from "@circle-fin/x402-batching/client";

async function main() {
  const amount = process.argv[2];
  if (!amount) throw new Error("Usage: tsx scripts/deposit-gateway.ts <amountUsdc>");

  const privateKey = process.env.AGENT_X402_PRIVATE_KEY as `0x${string}`;
  const client = new GatewayClient({ chain: "arcTestnet", privateKey });

  console.log(`Depositing ${amount} USDC into Circle Gateway for ${client.address}...`);
  const res = await client.deposit(amount);
  console.log("approvalTxHash:", res.approvalTxHash);
  console.log("depositTxHash:", res.depositTxHash);
  console.log("formattedAmount:", res.formattedAmount);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
