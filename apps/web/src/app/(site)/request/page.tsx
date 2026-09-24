import type { Metadata } from "next";
import Link from "next/link";
import { parseRequestParams } from "@/lib/request-link";
import { Nav } from "../../nav";
import { PageShell } from "../../detail-parts";
import { FundRequest, RequestGenerator } from "../../request-tools";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const parsed = parseRequestParams(await searchParams);
  if (parsed && parsed.ok) {
    return {
      title: `Pay $${parsed.request.amount} USDC · Arcurrent`,
      description: parsed.request.note || "A payment request, settled through MandateEscrow on Arc.",
    };
  }
  return { title: "Get paid through escrow · Arcurrent" };
}

export default async function RequestPage({ searchParams }: { searchParams: SearchParams }) {
  const parsed = parseRequestParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <PageShell>
        <div className="flex flex-col gap-2">
          <Link href="/dashboard" className="text-xs text-muted hover:text-foreground">
            ← Dashboard
          </Link>
          <h1 className="display text-[clamp(26px,3.4vw,36px)]">
            {parsed && parsed.ok ? "Someone is asking you to fund a payment" : "Get paid through escrow"}
          </h1>
          {!(parsed && parsed.ok) && (
            <p className="text-sm text-foreground/80">
              Make a link with your address and an amount. Whoever opens it can lock that USDC in MandateEscrow for you in one click. You post proof of the work, they release the funds, and your track record updates on-chain. No account, no fee to this project.
            </p>
          )}
        </div>

        {parsed && parsed.ok ? (
          <FundRequest request={parsed.request} />
        ) : (
          <>
            {parsed && !parsed.ok && (
              <p className="rounded-xl border border-dashed border-warning p-4 text-sm text-warning">
                This link is not valid: {parsed.error} You can create a fresh one below.
              </p>
            )}
            <RequestGenerator />
          </>
        )}
      </PageShell>
    </div>
  );
}
