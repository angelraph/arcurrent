"use server";

import {
  depositToEscrow,
  evaluatePendingObligations,
  getSupabaseServerClient,
  getTreasuryUsdcBalance,
  type Currency,
} from "@arcurrent/shared";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getEvaluateConfigFromEnv } from "@/lib/evaluate-config";

export interface CreateObligationState {
  error?: string;
  warning?: string;
}

// The public dashboard has no login: autonomy is the point, no human
// approves each transaction, which also means no login gate on who can
// trigger a real payout from the escrow. These two limits are a lightweight
// abuse guard, not real access control, real access control would defeat
// the "try it yourself" point of the demo. A determined bad actor can still
// get around a per-IP cooldown; this just stops one accidental or casual
// burst of submissions from draining the escrow or flooding the obligations
// table before a judge looks at it.
const MAX_PUBLIC_OBLIGATION_USDC = 25;
const SUBMISSION_COOLDOWN_MS = 5 * 60 * 1000;

// Same reasoning as above, applied to a different action: publicly
// triggerable, no login, guarded by a fixed amount and a per-IP cooldown
// instead of a gate. Safer than the obligation form in one respect, this
// only ever moves the project's own funds from the treasury wallet into the
// escrow contract, never to an address someone else chose. A longer
// cooldown than obligation submissions since the treasury itself is finite
// and this is a bigger operational action.
const TOPUP_AMOUNT_USDC = 20;
const TOPUP_COOLDOWN_MS = 15 * 60 * 1000;

async function getClientIp(): Promise<string> {
  const h = await headers();
  // Vercel sets x-forwarded-for; take the first (client) address in the list.
  const forwardedFor = h.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export async function createObligation(
  _prevState: CreateObligationState,
  formData: FormData
): Promise<CreateObligationState> {
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const currency = String(formData.get("currency") ?? "USDC") as Currency;
  const dueDate = String(formData.get("dueDate") ?? "");
  const destinationAddress = String(formData.get("destinationAddress") ?? "").trim();

  if (!vendorName) return { error: "Vendor name is required." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be a positive number." };
  if (amount > MAX_PUBLIC_OBLIGATION_USDC) {
    return { error: `Amount can't exceed ${MAX_PUBLIC_OBLIGATION_USDC} USDC on this public demo instance.` };
  }
  if (!dueDate) return { error: "Due date is required." };
  if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
    return { error: "Destination address must be a valid 0x-prefixed EVM address." };
  }

  const supabase = getSupabaseServerClient();
  const ip = await getClientIp();

  if (ip !== "unknown") {
    const { data: recent, error: cooldownError } = await supabase
      .from("obligation_submissions")
      .select("created_at")
      .eq("ip", ip)
      .order("created_at", { ascending: false })
      .limit(1);
    if (cooldownError) {
      console.error("Obligation cooldown lookup failed:", cooldownError);
      // Fail open on the cooldown check itself -- an unrelated Supabase
      // hiccup here shouldn't block a legitimate submission.
    } else if (recent?.[0]) {
      const elapsedMs = Date.now() - new Date(recent[0].created_at).getTime();
      if (elapsedMs < SUBMISSION_COOLDOWN_MS) {
        const retrySeconds = Math.ceil((SUBMISSION_COOLDOWN_MS - elapsedMs) / 1000);
        return { error: `Please wait ${retrySeconds}s before adding another obligation.` };
      }
    }
  }

  const { error } = await supabase.from("obligations").insert({
    vendor_name: vendorName,
    amount,
    currency,
    due_date: dueDate,
    destination_address: destinationAddress,
    status: "pending",
  });

  if (error) return { error: error.message };

  if (ip !== "unknown") {
    const { error: recordError } = await supabase.from("obligation_submissions").insert({ ip });
    if (recordError) {
      // The obligation is already saved -- a failure to log the cooldown
      // marker just means this IP isn't rate-limited for one cycle, not
      // that anything the user did failed.
      console.error("Failed to record obligation submission for cooldown:", recordError);
    }
  }

  // Evaluate right away instead of waiting for the next cron tick (up to 24h
  // on the Hobby plan), the same evaluatePendingObligations() the cron
  // route and apps/agent run, just triggered by the add instead of a clock.
  // Config missing (e.g. incomplete local .env) isn't a reason to fail the
  // obligation itself, it just falls back to waiting for the next cron run.
  const config = getEvaluateConfigFromEnv();
  if (!("error" in config)) {
    try {
      await evaluatePendingObligations(config);
    } catch (err) {
      // The obligation is already saved above, a transient failure here
      // (Circle API, RPC, oracle) shouldn't surface as a broken form. Log it
      // and let the next scheduled run pick it up instead.
      console.error("Post-save evaluation failed:", err);
      revalidatePath("/dashboard");
      return { warning: "Obligation saved. Evaluation will retry on the next scheduled run." };
    }
  }

  revalidatePath("/dashboard");
  return {};
}

export interface TopUpEscrowState {
  error?: string;
  success?: string;
}

// Public, self-service "add funds to escrow" action for the dashboard --
// lets a judge or tester who drains the escrow while testing top it back up
// without needing the project owner to run scripts/fund-escrow.ts by hand.
export async function topUpEscrow(
  _prevState: TopUpEscrowState,
  _formData: FormData
): Promise<TopUpEscrowState> {
  const config = getEvaluateConfigFromEnv();
  if ("error" in config) return { error: config.error };

  const supabase = getSupabaseServerClient();
  const ip = await getClientIp();

  if (ip !== "unknown") {
    const { data: recent, error: cooldownError } = await supabase
      .from("escrow_topups")
      .select("created_at")
      .eq("ip", ip)
      .order("created_at", { ascending: false })
      .limit(1);
    if (cooldownError) {
      console.error("Escrow top-up cooldown lookup failed:", cooldownError);
      // Fail open, same as the obligation form's cooldown check.
    } else if (recent?.[0]) {
      const elapsedMs = Date.now() - new Date(recent[0].created_at).getTime();
      if (elapsedMs < TOPUP_COOLDOWN_MS) {
        const retryMinutes = Math.ceil((TOPUP_COOLDOWN_MS - elapsedMs) / 60_000);
        return { error: `Please wait ${retryMinutes} more minute(s) before topping up again.` };
      }
    }
  }

  let treasuryBalance: number;
  try {
    treasuryBalance = await getTreasuryUsdcBalance(config.walletId);
  } catch (err) {
    console.error("Escrow top-up treasury balance check failed:", err);
    return { error: "Couldn't read the treasury balance right now. Try again in a moment." };
  }
  // Leave a little headroom past the deposit amount itself for gas -- Arc's
  // gas token is USDC, so the wallet needs a bit more than the raw transfer.
  if (treasuryBalance < TOPUP_AMOUNT_USDC + 1) {
    return {
      error: "Treasury balance is too low to top up right now. The project owner needs to refill the treasury wallet first.",
    };
  }

  try {
    await depositToEscrow({
      walletId: config.walletId,
      escrowAddress: config.escrowAddress,
      amountUsdc: TOPUP_AMOUNT_USDC,
    });
  } catch (err) {
    console.error("Escrow top-up deposit failed:", err);
    return { error: "Top-up failed. Try again in a few minutes." };
  }

  if (ip !== "unknown") {
    const { error: recordError } = await supabase.from("escrow_topups").insert({ ip });
    if (recordError) {
      // The deposit already went through -- a failure to log the cooldown
      // marker just means this IP isn't rate-limited for one cycle.
      console.error("Failed to record escrow top-up for cooldown:", recordError);
    }
  }

  revalidatePath("/dashboard");
  return { success: `Deposited $${TOPUP_AMOUNT_USDC} into escrow. Balance will update above shortly.` };
}
