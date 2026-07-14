/** Core domain types shared between the web dashboard and the agent service. */

export type Currency = "USDC" | "EURC";

export interface Obligation {
  id: string;
  vendorName: string;
  amount: number;
  currency: Currency;
  dueDate: string; // ISO 8601
  destinationAddress: string;
  status: "pending" | "scheduled" | "settled" | "failed";
  createdAt: string;
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
