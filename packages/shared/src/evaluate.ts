import type { BridgeChain } from "@circle-fin/app-kit";
import { decide } from "./decide.js";
import { getEscrowUsdcBalance, settleObligationOnChain } from "./circle.js";
import { topUpEscrowLiquidity } from "./liquidity.js";
import { payForFxRate } from "./nanopayments.js";
import { getSupabaseServerClient } from "./supabase.js";
import { toObligation, type NewAgentDecisionRow, type ObligationRow } from "./types.js";

export interface EvaluateConfig {
  walletId: string;
  walletAddress: string;
  escrowAddress: `0x${string}`;
  reserveThresholdUsdc: number;
  payAheadWindowDays: number;
  /** Omit to skip the nanopayment rate consultation on convert_currency obligations. */
  oracle?: { url: string; privateKey: `0x${string}` };
  /**
   * Omit to leave request_liquidity as a flag-only decision (no top-up
   * attempted). When set, a request_liquidity decision triggers a real CCTP
   * bridge from this Circle-custodied wallet into the treasury, followed by
   * an escrow deposit — see topUpEscrowLiquidity in liquidity.ts.
   */
  liquidity?: { sourceChain: BridgeChain; sourceAddress: string };
}

export interface EvaluateSummary {
  evaluated: number;
  actions: Record<string, number>;
}

/**
 * One evaluation pass over every pending obligation: decide, execute if the
 * decision is to pay, and persist the decision either way. Balance is
 * re-fetched between obligations since paying one changes what's affordable
 * for the next. Shared between the standalone agent script (apps/agent) and
 * the Vercel Cron route (apps/web) so there's exactly one implementation.
 */
export async function evaluatePendingObligations(config: EvaluateConfig): Promise<EvaluateSummary> {
  const { walletId, walletAddress, escrowAddress, reserveThresholdUsdc, payAheadWindowDays, oracle, liquidity } =
    config;
  const supabase = getSupabaseServerClient();

  const { data: obligations, error } = await supabase
    .from("obligations")
    .select("*")
    .eq("status", "pending")
    .order("due_date", { ascending: true });

  if (error) throw error;

  const summary: EvaluateSummary = { evaluated: 0, actions: {} };
  if (!obligations || obligations.length === 0) return summary;

  for (const dbRow of obligations as ObligationRow[]) {
    const row = toObligation(dbRow);
    const treasuryBalanceUsdc = await getEscrowUsdcBalance(escrowAddress);

    const result = decide({
      obligation: row,
      treasuryBalanceUsdc,
      reserveThresholdUsdc,
      payAheadWindowDays,
      now: new Date(),
    });

    let txHash: string | undefined;
    let reasoning = result.reasoning;
    let signals: Record<string, unknown> = result.signals;

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
    } else if (result.action === "convert_currency" && oracle) {
      // StableFX itself is still gated (see README), but the rate consultation
      // is real: the agent pays the oracle a sub-cent x402 nanopayment for the
      // reference rate before recording why it can't settle yet.
      const rate = await payForFxRate({ oracleUrl: oracle.url, privateKey: oracle.privateKey });
      signals = {
        ...signals,
        fxPair: rate.pair,
        fxRate: rate.rate,
        fxAsOf: rate.asOf,
        fxSource: rate.source,
        fxNanopaymentTx: rate.paymentTxHash,
        fxNanopaymentAmountUsdc: rate.amountPaidUsdc,
      };
      reasoning =
        `${reasoning} Paid the rate oracle ${rate.amountPaidUsdc} USDC via x402 for the current rate: ` +
        `1 ${rate.pair.slice(0, 3)} = ${rate.rate} ${rate.pair.slice(3)} (as of ${rate.asOf}, ${rate.source}).`;
    } else if (result.action === "request_liquidity" && liquidity) {
      // Bridge exactly the shortfall — enough to cover this obligation while
      // keeping the reserve floor intact. Settling from the topped-up balance
      // is left to the next evaluation pass (see topUpEscrowLiquidity).
      const shortfallUsdc = row.amount + reserveThresholdUsdc - treasuryBalanceUsdc;
      const topUp = await topUpEscrowLiquidity({
        amountUsdc: shortfallUsdc,
        sourceChain: liquidity.sourceChain,
        sourceAddress: liquidity.sourceAddress,
        treasuryWalletId: walletId,
        treasuryAddress: walletAddress,
        escrowAddress,
      });
      signals = {
        ...signals,
        liquidityTopUpUsdc: shortfallUsdc,
        liquidityBridgeState: topUp.bridge.state,
        liquidityBridgeSteps: topUp.bridge.steps,
        liquidityDepositTx: topUp.depositTransactionId,
      };
      reasoning =
        `${reasoning} Bridged ${shortfallUsdc.toFixed(2)} USDC from ${liquidity.sourceChain} via CCTP ` +
        `and deposited it into the escrow (deposit tx: ${topUp.depositTransactionId}). Will settle on ` +
        `the next evaluation pass now that the balance covers it.`;
    }

    const decisionRow: NewAgentDecisionRow = {
      obligation_id: row.id,
      action: result.action,
      reasoning,
      signals,
      tx_hash: txHash ?? null,
    };
    await supabase.from("agent_decisions").insert(decisionRow);

    summary.evaluated += 1;
    summary.actions[result.action] = (summary.actions[result.action] ?? 0) + 1;
  }

  return summary;
}
