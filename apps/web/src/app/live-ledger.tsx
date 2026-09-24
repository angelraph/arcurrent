import Link from "next/link";
import { formatUsdc } from "@/lib/format";
import { SectionHeader } from "./landing-sections";

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
  if (Number.isNaN(d.getTime())) return "--";
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

const ACTION_TONE: Record<string, string> = {
  pay_now: "text-[#7ee0a1]",
  wait: "text-[var(--band-muted)]",
  request_liquidity: "text-[var(--signal)]",
  insufficient_funds: "text-[#ff8a8a]",
  convert_currency: "text-[var(--signal)]",
};

/**
 * The agent's own log and the escrow's own rows, unedited. Nothing here is
 * copy: it is whatever the database and the chain returned a moment ago, so
 * an empty state is shown as empty rather than dressed up.
 */
export function LiveLedger({ data }: { data: LedgerData | null }) {
  return (
    <section id="ledger" className="border-b border-border">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-6 py-16 sm:py-20">
        <SectionHeader
          eyebrow="Unedited"
          title="What the agent actually did."
          intro="No mock-ups. Left is the agent's own decision log, right is the escrow contract's own rows. Both are read live."
        />

        <div className="overflow-hidden rounded-lg border border-[var(--band-rule)] bg-band text-band-foreground shadow-[0_18px_50px_-24px_rgba(7,11,20,0.7)]">
          <div className="flex items-center gap-2 border-b border-[var(--band-rule)] px-4 py-2.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 font-mono text-xs text-[var(--band-muted)]">arcurrent · agent.log · arc mainnet</span>
            <span className="ml-auto flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#7ee0a1]">
              <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-[#7ee0a1]" />
              live
            </span>
          </div>

          <div className="grid lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-4 p-5 font-mono text-[13px] leading-relaxed">
              <p className="text-[var(--band-muted)]">$ tail agent_decisions</p>
              {data && data.decisions.length > 0 ? (
                <ul className="flex flex-col gap-4">
                  {data.decisions.map((d) => (
                    <li key={d.id} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="text-[var(--band-muted)]">{stamp(d.createdAt)}</span>
                        <span className={`font-semibold uppercase ${ACTION_TONE[d.action] ?? ""}`}>{d.action}</span>
                        {d.txHash && (
                          <a
                            href={`${data.explorer}/tx/${d.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--signal)] hover:underline"
                          >
                            tx {d.txHash.slice(0, 10)}… ↗
                          </a>
                        )}
                      </div>
                      <p className="line-clamp-3 text-band-foreground/85">{d.reasoning}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--band-muted)]">no decisions recorded yet</p>
              )}
              <p className="text-[var(--band-muted)]">
                $ <span className="cursor" aria-hidden />
              </p>
            </div>

            <div className="flex flex-col gap-4 border-t border-[var(--band-rule)] p-5 font-mono text-[13px] lg:border-l lg:border-t-0">
              <p className="text-[var(--band-muted)]">$ cast call MandateEscrow --recent</p>
              {data && data.mandates.length > 0 ? (
                <ul className="flex flex-col divide-y divide-[var(--band-rule)]">
                  {data.mandates.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                      <Link href={`/mandate/${m.id}`} className="text-[var(--signal)] hover:underline">
                        mandate #{m.id}
                      </Link>
                      <span>${formatUsdc(m.amountUsdc)}</span>
                      <span className="text-[var(--band-muted)]">{m.status.toLowerCase()}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--band-muted)]">no mandates read</p>
              )}
              <Link href="/dashboard" className="mt-auto text-xs text-[var(--band-muted)] transition hover:text-band-foreground">
                open the full dashboard →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
