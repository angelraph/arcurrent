import "server-only";
import {
  getEscrowUsdcBalance,
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

export interface TreasuryBalances {
  /** What the agent can actually pay obligations from right now. */
  escrowUsdc: number | null;
  /** Sitting in the Circle-custodied wallet but not yet deposited into the escrow. */
  walletUsdc: number | null;
}

/**
 * Live balances from Circle/Arc. Each field is null (not a fake number) when
 * its address hasn't been configured yet, so the dashboard can show an honest
 * "not set up" state instead of a fabricated balance.
 */
export async function getTreasuryBalance(): Promise<TreasuryBalances> {
  const walletId = process.env.TREASURY_WALLET_ID;
  const escrowAddress = process.env.OBLIGATION_ESCROW_ADDRESS as `0x${string}` | undefined;

  const [walletUsdc, escrowUsdc] = await Promise.all([
    walletId ? getTreasuryUsdcBalance(walletId) : Promise.resolve(null),
    escrowAddress ? getEscrowUsdcBalance(escrowAddress) : Promise.resolve(null),
  ]);

  return { walletUsdc, escrowUsdc };
}
