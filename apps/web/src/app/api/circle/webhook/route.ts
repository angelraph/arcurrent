import {
  fetchNotificationPublicKey,
  getSupabaseServerClient,
  verifyWebhookSignature,
} from "@arcurrent/shared";
import { NextResponse } from "next/server";

/**
 * Receives Circle transaction webhooks and moves an obligation from
 * "scheduled" to "settled"/"failed" once the onchain transaction confirms.
 * `refId` on the transaction is the obligation id (set in settleObligationOnChain).
 *
 * Every request is verified against `X-Circle-Signature` (ECDSA-SHA256,
 * base64) using the public key for `X-Circle-Key-Id`, fetched from
 * `GET /v2/notifications/publicKey/{keyId}`. Verification runs against the
 * *raw* body text — parsing to JSON and re-serializing changes byte order and
 * breaks the signature, so `request.text()` is read before any JSON.parse.
 *
 * The exact envelope shape below (`notification.state` / `notification.refId`)
 * matches Circle's documented webhook format but hasn't been exercised against
 * a live webhook yet — confirm against a real payload during setup (point
 * WEBHOOK_ENDPOINT_URL at an ngrok tunnel and trigger a real transfer).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-circle-signature");
  const keyId = request.headers.get("x-circle-key-id");

  if (!signature || !keyId) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
  }

  let verified: boolean;
  try {
    const publicKey = await fetchNotificationPublicKey(keyId);
    verified = verifyWebhookSignature(rawBody, signature, publicKey);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    verified = false;
  }
  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const notification = body.notification ?? body;

  const state: string | undefined = notification?.state;
  const refId: string | undefined = notification?.refId;
  const circleTransactionId: string | undefined = notification?.id;
  const txHash: string | undefined = notification?.txHash;

  if (!refId || !state) {
    return NextResponse.json({ received: true, note: "no refId/state to act on" });
  }

  const nextStatus =
    state === "COMPLETE" ? "settled" : ["FAILED", "DENIED", "CANCELLED"].includes(state) ? "failed" : null;

  if (nextStatus) {
    const supabase = getSupabaseServerClient();
    await supabase.from("obligations").update({ status: nextStatus }).eq("id", refId);
    // txHash only exists once the transaction actually lands on-chain — not
    // at submission time, when settleObligationOnChain could only store
    // Circle's own transaction id. This is the one place the real hash
    // becomes available, so swap it in (matched on that same Circle id,
    // not obligation_id, so this can't touch an unrelated decision row for
    // the same obligation) so the explorer link actually resolves.
    if (txHash && circleTransactionId) {
      await supabase.from("agent_decisions").update({ tx_hash: txHash }).eq("tx_hash", circleTransactionId);
    }
  }

  return NextResponse.json({ received: true });
}
