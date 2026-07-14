/** Core domain types shared between the web dashboard and the agent service. */

export type Currency = "USDC" | "EURC";
export type ObligationStatus = "pending" | "scheduled" | "settled" | "failed";

export interface Obligation {
  id: string;
  vendorName: string;
  amount: number;
  currency: Currency;
  dueDate: string; // ISO 8601 date
  destinationAddress: string;
  status: ObligationStatus;
  createdAt: string;
}

/** Shape returned directly by Supabase (snake_case column names) — never used outside a mapper. */
export interface ObligationRow {
  id: string;
  vendor_name: string;
  amount: number | string;
  currency: Currency;
  due_date: string;
  destination_address: string;
  status: ObligationStatus;
  created_at: string;
}

export function toObligation(row: ObligationRow): Obligation {
  return {
    id: row.id,
    vendorName: row.vendor_name,
    amount: Number(row.amount),
    currency: row.currency,
    dueDate: row.due_date,
    destinationAddress: row.destination_address,
    status: row.status,
    createdAt: row.created_at,
  };
}

export type DecisionAction =
  | "pay_now"
  | "wait"
  | "convert_currency"
  | "request_liquidity"
  | "insufficient_funds";

export interface AgentDecision {
  id: string;
  obligationId: string;
  action: DecisionAction;
  reasoning: string;
  signals: Record<string, unknown>;
  txHash?: string;
  createdAt: string;
}

export interface NewAgentDecisionRow {
  obligation_id: string;
  action: DecisionAction;
  reasoning: string;
  signals: Record<string, unknown>;
  tx_hash: string | null;
}
