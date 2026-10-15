import Link from "next/link";
import { formatUsdc } from "@/lib/format";
import { SectionHeader } from "./landing-sections";
import { DecisionPill, MandateStatusPill } from "./status-pill";

export interface LedgerDecision {
  id: string;
  action: string;
  reasoning: string;
  txHash?: string;
  createdAt: string;
}

export interface LedgerMandate {
  id: number;
  amountUsdc: number;
  status: string;
}

export interface LedgerData {
  decisions: LedgerDecision[];
  mandates: LedgerMandate[];
  explorer: string;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) + " UTC";
}

/**
 * The agent's own decision log and the escrow's own rows, unedited. Nothing
 * here is copy: it is whatever the database and the chain returned a moment
 * ago, so an empty state is shown as empty rather than dressed up.
 */
export function LiveLedger({ data }: { data: LedgerData | null }) {
  return (
    <section id="ledger" className="border-b border-border">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 py-16 sm:py-20">
        <SectionHeader
          eyebrow="Live activity"
          title="What the agent actually did."
          intro="No mock-ups. On the left, the agent's own decision log. On the right, the escrow contract's own rows. Both are read live."
        />

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-sm font-semibold">Activity</span>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-success">
              <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-success" />
              Live from Arc mainnet
            </span>
          </div>

          <div className="grid lg:grid-cols-[1.5fr_1fr]">
            <div className="flex flex-col p-5">
              <h3 className="label-mono pb-3">Agent decisions</h3>
              {data && data.decisions.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border">
                  {data.decisions.map((d) => (
                    <li key={d.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <DecisionPill action={d.action} reasoning={d.reasoning} />
                        <span className="text-xs text-muted">{stamp(d.createdAt)}</span>
                        {d.txHash && /^0x[0-9a-fA-F]{64}$/.test(d.txHash) && (
                          <a
                            href={`${data.explorer}/tx/${d.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-accent hover:underline"
                          >
                            {d.txHash.slice(0, 10)}… ↗
                          </a>
                        )}
                      </div>
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted">{d.reasoning}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No decisions recorded yet.</p>
              )}
            </div>

            <div className="flex flex-col border-t border-border p-5 lg:border-l lg:border-t-0">
              <h3 className="label-mono pb-3">Escrow mandates</h3>
              {data && data.mandates.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border">
                  {data.mandates.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <Link href={`/mandate/${m.id}`} className="font-medium text-accent hover:underline">
                        Mandate #{m.id}
                      </Link>
                      <span className="font-mono text-sm">${formatUsdc(m.amountUsdc)}</span>
                      <MandateStatusPill status={m.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No mandates read.</p>
              )}
              <Link href="/dashboard" className="mt-auto pt-4 text-sm font-medium text-muted transition hover:text-foreground">
                Open the full dashboard →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
