import "server-only";
import {
  getMandate,
  getMandateReputation,
  getMandates,
  getSupabaseServerClient,
  getTreasuryUsdcBalance,
  getVaultPolicy,
  toObligation,
  type AgentDecision,
  type Mandate,
  type MandateReputation,
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

/**
 * The treasury AgentVault as the dashboard shows it. Plain strings and numbers
 * only (no bigint), so it can cross from server to client components freely.
 */
export interface VaultOverview {
  address: `0x${string}`;
  owner: `0x${string}`;
  operator: `0x${string}`;
  guardian: `0x${string}`;
  balanceUsdc: string;
  perPaymentCapUsdc: string;
  dailyCapUsdc: string;
  availableUsdc: string;
  /** How full the daily allowance is right now, 0 to 100. */
  availablePercent: number;
  allowlistRequired: boolean;
  paused: boolean;
  /** USDC in the agent's own Circle wallet, which only pays gas. Null if the wallet isn't configured. */
  gasFloatUsdc: number | null;
}

/** null when VAULT_ADDRESS isn't configured (an honest "not set up" state, never a made-up number). */
export async function getVaultOverview(): Promise<VaultOverview | null> {
  const address = process.env.VAULT_ADDRESS as `0x${string}` | undefined;
  if (!address) return null;

  const walletId = process.env.TREASURY_WALLET_ID;
  const [policy, gasFloatUsdc] = await Promise.all([
    getVaultPolicy(address),
    walletId ? getTreasuryUsdcBalance(walletId).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    address,
    owner: policy.owner,
    operator: policy.operator,
    guardian: policy.guardian,
    balanceUsdc: policy.balanceUsdc,
    perPaymentCapUsdc: policy.perPaymentCapUsdc,
    dailyCapUsdc: policy.dailyCapUsdc,
    availableUsdc: policy.availableUsdc,
    availablePercent: policy.dailyCap === 0n ? 0 : Number((policy.available * 10_000n) / policy.dailyCap) / 100,
    allowlistRequired: policy.allowlistRequired,
    paused: policy.paused,
    gasFloatUsdc,
  };
}

export interface MandateWithReputation extends Mandate {
  fulfillerReputation: MandateReputation | null;
}

/**
 * Pure on-chain read, unlike getObligations() above — MandateEscrow has no
 * Supabase table, since it's meant to be an open primitive any address can
 * call directly, not just this project's own agent. Empty array (not a
 * fabricated list) when MANDATE_ESCROW_ADDRESS isn't configured yet, same
 * "honest not-set-up state" convention as getTreasuryBalance().
 */
export async function getMandatesWithReputation(): Promise<MandateWithReputation[]> {
  const escrowAddress = process.env.MANDATE_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!escrowAddress) return [];

  const mandates = await getMandates(escrowAddress);
  const reputations = await Promise.all(
    mandates.map((m) => getMandateReputation(escrowAddress, m.fulfiller))
  );

  return mandates.map((m, i) => ({ ...m, fulfillerReputation: reputations[i] }));
}

function getEscrowAddress(): `0x${string}` | undefined {
  return process.env.MANDATE_ESCROW_ADDRESS as `0x${string}` | undefined;
}

/** null when the id was never created (or MANDATE_ESCROW_ADDRESS isn't configured). */
export async function getMandateById(id: number): Promise<MandateWithReputation | null> {
  const escrowAddress = getEscrowAddress();
  if (!escrowAddress) return null;

  const mandate = await getMandate(escrowAddress, id);
  if (!mandate) return null;
  return { ...mandate, fulfillerReputation: await getMandateReputation(escrowAddress, mandate.fulfiller) };
}

export interface AddressProfile {
  address: `0x${string}`;
  reputation: MandateReputation | null;
  asFunder: Mandate[];
  asFulfiller: Mandate[];
}

/** Everything the contract knows about one address: its reputation ledger entry and every mandate it appears in. */
export async function getAddressProfile(address: `0x${string}`): Promise<AddressProfile | null> {
  const escrowAddress = getEscrowAddress();
  if (!escrowAddress) return null;

  const [reputation, mandates] = await Promise.all([
    getMandateReputation(escrowAddress, address),
    getMandates(escrowAddress),
  ]);
  const same = (a: string) => a.toLowerCase() === address.toLowerCase();
  return {
    address,
    reputation,
    asFunder: mandates.filter((m) => same(m.funder)),
    asFulfiller: mandates.filter((m) => same(m.fulfiller)),
  };
}
