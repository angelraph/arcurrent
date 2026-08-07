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

/**
 * One decision per obligation: whichever is most recent for that obligation,
 * regardless of how it ranks in the global recent-decisions feed. The
 * obligations table's "Latest decision" column used to be derived from
 * getRecentDecisions()'s limited window, so an obligation could silently
 * flip to "not yet evaluated" once enough newer decisions (for *other*
 * obligations) pushed its real decision out of that window, even though it
 * was correctly evaluated and settled. postgrest-js has no DISTINCT ON, so
 * this fetches decisions.length rows aren't bounded by the feed's limit,
 * bounded to a generous cap instead, and reduces to one-per-obligation in
 * JS. Fine at this project's scale; revisit with a DB view if that changes.
 */
export async function getLatestDecisionByObligation(): Promise<Map<string, AgentDecision>> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_decisions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const latest = new Map<string, AgentDecision>();
  for (const row of data as DecisionRow[]) {
    if (!latest.has(row.obligation_id)) {
      latest.set(row.obligation_id, toDecision(row));
    }
  }
  return latest;
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
