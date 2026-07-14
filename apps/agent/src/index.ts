import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getEscrowUsdcBalance,
  getSupabaseServerClient,
  settleObligationOnChain,
  toObligation,
  type ObligationRow,
  type NewAgentDecisionRow,
} from "@arcurrent/shared";
import { decide } from "./decide.js";

// Monorepo root .env — dotenv/config alone loads from this workspace's own
// directory (apps/agent), not the workspace root where the shared .env lives.
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const RESERVE_THRESHOLD_USDC = Number(process.env.TREASURY_RESERVE_USDC ?? "0");
const PAY_AHEAD_WINDOW_DAYS = Number(process.env.AGENT_PAY_AHEAD_WINDOW_DAYS ?? "3");

/**
 * One evaluation pass over every pending obligation: decide, execute if the
 * decision is to pay, and persist the decision either way. Balance is
 * re-fetched between obligations since paying one changes what's affordable
 * for the next.
 */
async function runOnce() {
  const walletId = process.env.TREASURY_WALLET_ID;
  if (!walletId) {
    throw new Error("TREASURY_WALLET_ID is not set — run the wallet setup step first.");
  }
  const escrowAddress = process.env.OBLIGATION_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!escrowAddress) {
    throw new Error("OBLIGATION_ESCROW_ADDRESS is not set — deploy the escrow contract first.");
  }

  const supabase = getSupabaseServerClient();

  const { data: obligations, error } = await supabase
    .from("obligations")
    .select("*")
    .eq("status", "pending")
    .order("due_date", { ascending: true });

  if (error) throw error;
  if (!obligations || obligations.length === 0) {
    console.log("No pending obligations.");
    return;
  }

  console.log(`Evaluating ${obligations.length} pending obligation(s)...`);

  for (const dbRow of obligations as ObligationRow[]) {
    const row = toObligation(dbRow);
    const treasuryBalanceUsdc = await getEscrowUsdcBalance(escrowAddress);

    const result = decide({
      obligation: row,
      treasuryBalanceUsdc,
      reserveThresholdUsdc: RESERVE_THRESHOLD_USDC,
      payAheadWindowDays: PAY_AHEAD_WINDOW_DAYS,
      now: new Date(),
    });

    console.log(`[${row.vendorName}] ${result.action} — ${result.reasoning}`);

    let txHash: string | undefined;

    if (result.action === "pay_now") {
      const { transactionId } = await settleObligationOnChain({
        walletId,
        escrowAddress,
        obligationId: row.id,
        destinationAddress: row.destinationAddress,
        amountUsdc: row.amount,
      });
      txHash = transactionId;

      await supabase.from("obligations").update({ status: "scheduled" }).eq("id", row.id);
    }

    const decisionRow: NewAgentDecisionRow = {
      obligation_id: row.id,
      action: result.action,
      reasoning: result.reasoning,
      signals: result.signals,
      tx_hash: txHash ?? null,
    };
    await supabase.from("agent_decisions").insert(decisionRow);
  }
}

runOnce().catch((err) => {
  console.error(err);
  process.exit(1);
});
