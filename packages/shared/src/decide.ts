import type { AgentDecision, DecisionAction, Obligation } from "./types.js";

export interface DecisionInput {
  obligation: Obligation;
  treasuryBalanceUsdc: number;
  reserveThresholdUsdc: number;
  payAheadWindowDays: number;
  now: Date;
}

export type DecisionResult = Pick<AgentDecision, "action" | "reasoning" | "signals">;

/**
 * Pure decision function — no I/O, so it's testable without a live Circle/Supabase
 * connection. Every branch reasons from real inputs (balance, due date, reserve
 * floor); there is no default/fake path.
 */
export function decide(input: DecisionInput): DecisionResult {
  const { obligation, treasuryBalanceUsdc, reserveThresholdUsdc, payAheadWindowDays, now } = input;

  const daysUntilDue = Math.ceil(
    (new Date(obligation.dueDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );

  const signals = {
    treasuryBalanceUsdc,
    reserveThresholdUsdc,
    payAheadWindowDays,
    daysUntilDue,
    obligationAmount: obligation.amount,
    obligationCurrency: obligation.currency,
  };

  if (obligation.currency !== "USDC") {
    return {
      action: "convert_currency" satisfies DecisionAction,
      reasoning:
        `Obligation is denominated in ${obligation.currency}. StableFX access is gated ` +
        `(RFQ-based, pending Circle approval) and no conversion path is wired in yet, ` +
        `so this cannot be settled automatically.`,
      signals,
    };
  }

  const balanceAfterPayment = treasuryBalanceUsdc - obligation.amount;

  if (treasuryBalanceUsdc < obligation.amount) {
    return {
      action: "insufficient_funds",
      reasoning:
        `Treasury balance ($${treasuryBalanceUsdc.toFixed(2)}) is below the obligation ` +
        `amount ($${obligation.amount.toFixed(2)}); cannot settle without a deposit or ` +
        `cross-chain liquidity top-up.`,
      signals,
    };
  }

  if (balanceAfterPayment < reserveThresholdUsdc) {
    return {
      action: "request_liquidity",
      reasoning:
        `Paying now would drop the balance to $${balanceAfterPayment.toFixed(2)}, below ` +
        `the $${reserveThresholdUsdc.toFixed(2)} reserve floor. Would need a cross-chain ` +
        `liquidity top-up before settling; that path isn't wired in yet.`,
      signals,
    };
  }

  if (daysUntilDue > payAheadWindowDays) {
    return {
      action: "wait",
      reasoning:
        `Due in ${daysUntilDue} day(s), outside the ${payAheadWindowDays}-day pay-ahead ` +
        `window. Holding USDC rather than settling early.`,
      signals,
    };
  }

  return {
    action: "pay_now",
    reasoning:
      `Due in ${daysUntilDue} day(s), within the ${payAheadWindowDays}-day pay-ahead ` +
      `window. Balance ($${treasuryBalanceUsdc.toFixed(2)}) covers the ` +
      `$${obligation.amount.toFixed(2)} payment with the reserve floor intact ` +
      `($${balanceAfterPayment.toFixed(2)} remaining >= $${reserveThresholdUsdc.toFixed(2)}).`,
    signals,
  };
}
