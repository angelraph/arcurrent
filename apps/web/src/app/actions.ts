"use server";

import { getSupabaseServerClient, type Currency } from "@arcurrent/shared";
import { revalidatePath } from "next/cache";

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

  revalidatePath("/dashboard");
  return {};
}
