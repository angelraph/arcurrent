"use server";

import {
  evaluatePendingObligations,
  getSupabaseServerClient,
  type Currency,
} from "@arcurrent/shared";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getEvaluateConfigFromEnv } from "@/lib/evaluate-config";

export interface CreateObligationState {
  error?: string;
  warning?: string;
}

// This form spends Arcurrent's own treasury, not the submitter's money, so
// unlike MandateEscrow (permissionless by design, anyone funds their own
// mandate) it needs a real gate: OWNER_SECRET, checked below, restricts
// who can queue a payout at all. The cap and cooldown are what's left over
// from before that gate existed; kept as defense in depth against the
// owner's own passcode leaking or being brute-forced, not the primary guard.
const MAX_PUBLIC_OBLIGATION_USDC = 25;
const SUBMISSION_COOLDOWN_MS = 5 * 60 * 1000;

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
  const ownerSecret = process.env.OWNER_SECRET;
  if (!ownerSecret) {
    return { error: "OWNER_SECRET is not configured; this form is locked until it is." };
  }
  const submittedSecret = String(formData.get("ownerSecret") ?? "");
  if (submittedSecret !== ownerSecret) {
    return { error: "Wrong owner passcode. This spends Arcurrent's own treasury, not yours; use the wallet panel above to fund your own mandate instead." };
  }

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

