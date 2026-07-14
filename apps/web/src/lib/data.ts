import "server-only";
import {
  getSupabaseServerClient,
  getTreasuryUsdcBalance,
  toObligation,
  type AgentDecision,
  type Obligation,
  type ObligationRow,
} from "@arcurrent/shared";

export interface DecisionRow {
  id: string;
  obligation_id: string;
  action: AgentDecision["action"];
  reasoning: string;
  signals: Record<string, unknown>;
  tx_hash: string | null;
  created_at: string;
}

function toDecision(row: DecisionRow): AgentDecision {
  return {
    id: row.id,
    obligationId: row.obligation_id,
    action: row.action,
    reasoning: row.reasoning,
    signals: row.signals,
    txHash: row.tx_hash ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getObligations(): Promise<Obligation[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("obligations")
    .select("*")
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data as ObligationRow[]).map(toObligation);
}

export async function getRecentDecisions(limit = 20): Promise<AgentDecision[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_decisions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DecisionRow[]).map(toDecision);
}

/**
 * Live treasury balance from Circle. Returns null (not a fake number) when
 * TREASURY_WALLET_ID hasn't been configured yet, so the dashboard can show an
 * honest "not set up" state instead of a fabricated balance.
 */
export async function getTreasuryBalance(): Promise<number | null> {
  const walletId = process.env.TREASURY_WALLET_ID;
  if (!walletId) return null;
  return getTreasuryUsdcBalance(walletId);
}
