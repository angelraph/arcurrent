"use server";

import { evaluatePendingObligations, getSupabaseServerClient, type Currency } from "@arcurrent/shared";
import { revalidatePath } from "next/cache";
import { getEvaluateConfigFromEnv } from "@/lib/evaluate-config";

export interface CreateObligationState {
  error?: string;
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
  if (!dueDate) return { error: "Due date is required." };
  if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
    return { error: "Destination address must be a valid 0x-prefixed EVM address." };
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("obligations").insert({
    vendor_name: vendorName,
    amount,
    currency,
    due_date: dueDate,
    destination_address: destinationAddress,
    status: "pending",
  });

  if (error) return { error: error.message };

  // Evaluate right away instead of waiting for the next cron tick (up to 24h
  // on the Hobby plan) — the same evaluatePendingObligations() the cron
  // route and apps/agent run, just triggered by the add instead of a clock.
  // Config missing (e.g. incomplete local .env) isn't a reason to fail the
  // obligation itself — it just falls back to waiting for the next cron run.
  const config = getEvaluateConfigFromEnv();
  if (!("error" in config)) {
    await evaluatePendingObligations(config);
  }

  revalidatePath("/dashboard");
  return {};
}
