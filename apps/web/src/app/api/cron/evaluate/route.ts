import { evaluatePendingObligations } from "@arcurrent/shared";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron target — see vercel.json. Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` on scheduled invocations (once
 * CRON_SECRET is set as a project env var); this route fails closed if that
 * header doesn't match, since a real request here can move real USDC.
 *
 * This is the same evaluation loop apps/agent runs standalone — see
 * packages/shared/src/evaluate.ts for the one shared implementation.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const walletId = process.env.TREASURY_WALLET_ID;
  const escrowAddress = process.env.OBLIGATION_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!walletId || !escrowAddress) {
    return NextResponse.json(
      { error: "TREASURY_WALLET_ID and OBLIGATION_ESCROW_ADDRESS must be set" },
      { status: 500 }
    );
  }

  const oracleUrl = process.env.ORACLE_URL;
  const x402Key = process.env.AGENT_X402_PRIVATE_KEY as `0x${string}` | undefined;

  const summary = await evaluatePendingObligations({
    walletId,
    escrowAddress,
    reserveThresholdUsdc: Number(process.env.TREASURY_RESERVE_USDC ?? "0"),
    payAheadWindowDays: Number(process.env.AGENT_PAY_AHEAD_WINDOW_DAYS ?? "3"),
    oracle: oracleUrl && x402Key ? { url: oracleUrl, privateKey: x402Key } : undefined,
  });

  return NextResponse.json(summary);
}
