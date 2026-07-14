import { getSupabaseServerClient } from "@arcurrent/shared";
import { NextResponse } from "next/server";

/**
 * Receives Circle transaction webhooks and moves an obligation from
 * "scheduled" to "settled"/"failed" once the onchain transaction confirms.
 * `refId` on the transaction is the obligation id (set in settleObligationOnChain).
 *
 * NOT YET DONE: signature verification. Circle signs every webhook with
 * `X-Circle-Signature` / `X-Circle-Key-Id` headers — verify them via the
 * SDK's `client.getPublicKey()` (developer-controlled-wallets) before this
 * handles anything but testnet traffic. Skipped for now to keep hackathon
 * scope moving; tracked here rather than silently ignored.
 *
 * The exact envelope shape below (`notification.state` / `notification.refId`)
 * matches Circle's documented webhook format but hasn't been exercised against
 * a live webhook yet — confirm against a real payload during setup (point
 * WEBHOOK_ENDPOINT_URL at an ngrok tunnel and trigger a real transfer).
 */
export async function POST(request: Request) {
  const body = await request.json();
  const notification = body.notification ?? body;

  const state: string | undefined = notification?.state;
  const refId: string | undefined = notification?.refId;

  if (!refId || !state) {
    return NextResponse.json({ received: true, note: "no refId/state to act on" });
  }

  const nextStatus =
    state === "COMPLETE" ? "settled" : ["FAILED", "DENIED", "CANCELLED"].includes(state) ? "failed" : null;

  if (nextStatus) {
    const supabase = getSupabaseServerClient();
    await supabase.from("obligations").update({ status: nextStatus }).eq("id", refId);
  }

  return NextResponse.json({ received: true });
}
