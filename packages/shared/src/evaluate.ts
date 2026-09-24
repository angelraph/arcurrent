import type { BridgeChain } from "@circle-fin/app-kit";
import { decide } from "./decide.js";
import { gateFromCheck, getVaultClient, payViaVault, type VaultPayment } from "./vault.js";
import { topUpTreasuryLiquidity } from "./liquidity.js";
import { payForFxRate } from "./nanopayments.js";
import { getSupabaseServerClient } from "./supabase.js";
import { toObligation, type NewAgentDecisionRow, type ObligationRow } from "./types.js";

export interface EvaluateConfig {
  /** The agent's Circle wallet. It is the vault's operator: it signs vault.pay() and holds gas only, never the treasury. */
  walletId: string;
  walletAddress: string;
  /**
   * The AgentVault that holds the treasury and enforces the owner's spending
   * rules (per-payment cap, daily cap, payee allowlist, pause). pay_now
   * settles by calling vault.pay(), which creates and releases a MandateEscrow
   * mandate atomically. The balance the agent decides against is the vault's.
   */
  vaultAddress: `0x${string}`;
  reserveThresholdUsdc: number;
  payAheadWindowDays: number;
  /** Omit to skip the nanopayment rate consultation on convert_currency obligations. */
  oracle?: { url: string; privateKey: `0x${string}` };
  /**
   * Omit to leave request_liquidity as a flag-only decision (no top-up
   * attempted). When set, a request_liquidity decision triggers a real CCTP
   * bridge from this Circle-custodied wallet into the vault — see
   * topUpTreasuryLiquidity in liquidity.ts.
   */
  liquidity?: { sourceChain: BridgeChain; sourceAddress: string };
}

export interface EvaluateSummary {
  evaluated: number;
  actions: Record<string, number>;
  /** Obligations where evaluation itself threw (see the per-obligation catch below), not decided-and-logged. */
  failed: number;
}

/**
 * True if the conditional claim update actually matched a row. Supabase
 * returns an empty array (not an error) when the WHERE clause matches
 * nothing, which is exactly the "someone else already claimed this" case.
 */
export function wasClaimed(rows: unknown[] | null): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * One evaluation pass over every pending obligation: decide, execute if the
 * decision is to pay, and persist the decision either way. Balance is
 * re-fetched between obligations since paying one changes what's affordable
 * for the next. Shared between the standalone agent script (apps/agent) and
 * the Vercel Cron route (apps/web) so there's exactly one implementation.
 */
export async function evaluatePendingObligations(config: EvaluateConfig): Promise<EvaluateSummary> {
  const { walletId, walletAddress, vaultAddress, reserveThresholdUsdc, payAheadWindowDays, oracle, liquidity } =
    config;
  const vault = getVaultClient(vaultAddress);
  const supabase = getSupabaseServerClient();

  const { data: obligations, error } = await supabase
    .from("obligations")
    .select("*")
    .eq("status", "pending")
    .order("due_date", { ascending: true });

  if (error) throw error;

  const summary: EvaluateSummary = { evaluated: 0, actions: {}, failed: 0 };
  if (!obligations || obligations.length === 0) return summary;

  for (const dbRow of obligations as ObligationRow[]) {
    const row = toObligation(dbRow);
    // One obligation's failure (a Circle/RPC/oracle hiccup, a CCTP timeout)
    // must not silently abort evaluation of the rest of this pass -- that
    // could leave later obligations sitting unevaluated for up to 24h
    // (Hobby-plan cron cadence) with no logged reason. Catch per-obligation,
    // log why, and move on to the next one.
    let result: ReturnType<typeof decide> | undefined;
    try {
      // The treasury is the vault's USDC balance. The agent's own wallet only
      // holds gas, so its balance says nothing about what can be paid.
      const policy = await vault.getPolicy();
      const treasuryBalanceUsdc = Number(policy.balanceUsdc);

      result = decide({
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
        // decide() knows the balance, the due date and the reserve floor. The
        // vault adds the owner's rules on top. Ask it first, without spending
        // anything, so a payment it would refuse becomes a logged "hold"
        // (the obligation stays pending for the next pass) instead of a
        // reverted transaction.
        const check = await vault.checkPay(
          { to: row.destinationAddress, amountUsdc: row.amount.toFixed(6) },
          walletAddress as `0x${string}`
        );
        const gate = gateFromCheck(check);
        if (gate) {
          result = { ...result, action: gate.action, reasoning: `${result.reasoning} ${gate.reasoning}` };
          reasoning = result.reasoning;
          signals = {
            ...signals,
            heldByVault: check.ok ? null : check.code,
            vaultAvailableUsdc: policy.availableUsdc,
            vaultBalanceUsdc: policy.balanceUsdc,
          };
        }
      }

      if (result.action === "pay_now") {
        // Atomically claim this obligation before settling, so two overlapping
        // evaluation passes (a double form-submit, or a manual trigger racing
        // cron) can't both call settle() on the same one and double-pay it.
        // Reuses the existing "scheduled" status as the claim state, no schema
        // change needed: the `.eq("status", "pending")` guard means only one
        // caller's update actually matches a row, Supabase-side, atomically.
        const { data: claimed, error: claimError } = await supabase
          .from("obligations")
          .update({ status: "scheduled" })
          .eq("id", row.id)
          .eq("status", "pending")
          .select("id");
        if (claimError) throw claimError;
        if (!wasClaimed(claimed)) {
          // Someone else already claimed it in the window between this pass's
          // read and its write. Skip entirely: no decision row, no double-pay.
          continue;
        }

        let payment: VaultPayment;
        try {
          payment = await payViaVault({
            walletId,
            vaultAddress,
            obligationId: row.id,
            destinationAddress: row.destinationAddress,
            amountUsdc: row.amount,
          });
        } catch (err) {
          // payViaVault only throws if Circle never accepted the transaction,
          // so nothing was submitted on-chain and it is safe to release the
          // claim for the next pass to retry. Once a transaction is accepted
          // it never throws, so a slow confirmation cannot be mistaken for a
          // failure and paid a second time.
          await supabase.from("obligations").update({ status: "pending" }).eq("id", row.id);
          throw err;
        }
        txHash = payment.transactionId;
        const mandateId = payment.mandateId ?? undefined;

        // Insert the decision row right away, not after the loop body's
        // other branches — Circle's webhook can (and on testnet, does)
        // confirm fast enough to arrive before this pass finishes, and its
        // backfill matches on `tx_hash = <this Circle transaction id>` (see
        // the webhook route). If that UPDATE races ahead of this INSERT, it
        // finds no row to match and silently no-ops, leaving the dashboard
        // stuck on "waiting for confirmation" for a transaction that already
        // confirmed. pay_now's reasoning/signals are already final at this
        // point (no later branch mutates them), so nothing is lost by not
        // waiting for the bottom-of-loop insert used by the other actions.
        const payNowDecisionRow: NewAgentDecisionRow = {
          obligation_id: row.id,
          action: result.action,
          reasoning: mandateId
            ? `${reasoning} Paid through the vault as MandateEscrow mandate #${mandateId}.`
            : `${reasoning} Submitted through the vault; the mandate appears once the transaction confirms.`,
          signals: mandateId ? { ...signals, mandateId } : signals,
          tx_hash: txHash ?? null,
        };
        await supabase.from("agent_decisions").insert(payNowDecisionRow);
        summary.evaluated += 1;
        summary.actions[result.action] = (summary.actions[result.action] ?? 0) + 1;
        continue;
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
        // is left to the next evaluation pass (see topUpTreasuryLiquidity). A
        // failure here (including a bridge timeout, see BRIDGE_TIMEOUT_MS in
        // liquidity.ts) is handled by the catch below, same as any other
        // action -- no bespoke handling needed now that every action shares
        // one per-obligation catch.
        const shortfallUsdc = row.amount + reserveThresholdUsdc - treasuryBalanceUsdc;
        const topUp = await topUpTreasuryLiquidity({
          amountUsdc: shortfallUsdc,
          sourceChain: liquidity.sourceChain,
          sourceAddress: liquidity.sourceAddress,
          treasuryAddress: vaultAddress,
        });
        signals = {
          ...signals,
          liquidityTopUpUsdc: shortfallUsdc,
          liquidityBridgeState: topUp.bridge.state,
          liquidityBridgeSteps: topUp.bridge.steps,
        };
        reasoning =
          `${reasoning} Bridged ${shortfallUsdc.toFixed(2)} USDC from ${liquidity.sourceChain} via CCTP into ` +
          `the vault. Will pay through it on the next evaluation pass now that the ` +
          `balance covers it.`;
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Evaluation failed for obligation ${row.id}:`, err);
      // No dedicated "error" action exists in the decision_action enum (that
      // would need a schema migration). insufficient_funds is the closest
      // existing semantic -- "this pass could not settle it" -- and the
      // reasoning text makes clear it was actually an evaluation error, not
      // a real balance shortfall, so the dashboard doesn't misrepresent it.
      const failedDecisionRow: NewAgentDecisionRow = {
        obligation_id: row.id,
        action: "insufficient_funds",
        reasoning: `Evaluation failed${result ? ` (attempted: ${result.action})` : ""}: ${message}. Will retry on the next evaluation pass.`,
        signals: { evaluationError: message },
        tx_hash: null,
      };
      await supabase.from("agent_decisions").insert(failedDecisionRow);
      summary.failed += 1;
    }
  }

  return summary;
}
