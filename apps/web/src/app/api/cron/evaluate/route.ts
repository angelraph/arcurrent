import { evaluatePendingObligations } from "@arcurrent/shared";
import { NextResponse } from "next/server";
import { getEvaluateConfigFromEnv } from "@/lib/evaluate-config";

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

  const config = getEvaluateConfigFromEnv();
  if ("error" in config) {
    return NextResponse.json({ error: config.error }, { status: 500 });
  }

  const summary = await evaluatePendingObligations(config);
  return NextResponse.json(summary);
}
