import {
  getLatestDecisionByObligation,
  getMandatesWithReputation,
  getObligations,
  getRecentDecisions,
  getVaultOverview,
} from "@/lib/data";
import Link from "next/link";
import { formatUsdc } from "@/lib/format";
import { Nav } from "../../nav";
import { ObligationForm } from "../../obligation-form";
import { DecisionPill, MandateStatusPill, StatusPill } from "../../status-pill";
import { VaultOwnerPanel } from "../../vault-owner-panel";
import { VaultPanel } from "../../vault-panel";
import { WalletMandatePanel } from "../../wallet-mandate-panel";
import { getActiveArcNetwork, type AgentDecision } from "@arcurrent/shared";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const dynamic = "force-dynamic";
// Adding an obligation triggers a real evaluation pass (see actions.ts) --
// possibly a CCTP bridge, which can take a while. Same 60s ceiling as the
// cron route.
export const maxDuration = 60;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mandate?: string | string[] }>;
}) {
  const { mandate: mandateParam } = await searchParams;
  const initialMandateId = Array.isArray(mandateParam) ? mandateParam[0] : mandateParam;
  const network = getActiveArcNetwork();
  // Promise.allSettled, not Promise.all: a real transient failure in one
  // panel's data (RPC blip, Circle rate limit, Supabase hiccup) shouldn't
  // blank the entire live dashboard. Each panel degrades independently below.
  const [vaultResult, obligationsResult, decisionsResult, latestDecisionsResult, mandatesResult] =
    await Promise.allSettled([
      getVaultOverview(),
      getObligations(),
      getRecentDecisions(),
      getLatestDecisionByObligation(),
      getMandatesWithReputation(),
    ]);

  const vault = vaultResult.status === "fulfilled" ? vaultResult.value : null;
  const vaultUnavailable = vaultResult.status === "rejected";
  const obligations = obligationsResult.status === "fulfilled" ? obligationsResult.value : [];
  const obligationsUnavailable = obligationsResult.status === "rejected";
  const decisions = decisionsResult.status === "fulfilled" ? decisionsResult.value : [];
  const decisionsUnavailable = decisionsResult.status === "rejected";
  const mandates = mandatesResult.status === "fulfilled" ? mandatesResult.value : [];
  const mandatesUnavailable = mandatesResult.status === "rejected";
  const isVault = (address: string) => !!vault && vault.address.toLowerCase() === address.toLowerCase();
  // Separate from the decision-log feed above (which is intentionally
  // limited to the most recent 20) -- this is a per-obligation lookup, not
  // windowed by recency, so an older obligation's "latest decision" doesn't
  // disappear just because newer obligations logged more decisions since.
  // Falls back to an empty map on failure, same "not yet evaluated" state
  // as if it genuinely hadn't run, not a scarier error.
  const latestDecisionByObligation =
    latestDecisionsResult.status === "fulfilled" ? latestDecisionsResult.value : new Map<string, AgentDecision>();

  return (
    <div className="flex flex-1 flex-col">
      <Nav />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
        <div className="flex flex-col gap-1" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Live dashboard</span>
          <h2 className="text-2xl font-semibold tracking-tight">Treasury &amp; obligations</h2>
          <p className="text-sm text-foreground/80">Real balances, real obligations, real agent decisions, all on {network.name}.</p>
        </div>

        {/*
          Deliberately the first interactive thing on the page, ahead of the
          agent's own obligation form below -- this is the primitive itself,
          usable with anyone's own funds. Buried further down (its original
          position, next to the read-only Mandates table), the obvious next
          action for a visitor was "Add obligation," which spends *this
          project's* treasury, not their own. That's backwards: the open,
          self-serve path should be what people reach for first.
        */}
        <WalletMandatePanel initialMandateId={initialMandateId} />

        <VaultPanel vault={vault} unavailable={vaultUnavailable} />
        <VaultOwnerPanel />

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Add obligation</h2>
            <p className="text-xs text-muted">
              This is this project&apos;s own agent demo · it spends Arcurrent&apos;s treasury above, not
              yours. To try MandateEscrow with your own funds instead, use the panel near the top of this
              page.
            </p>
          </div>
          <ObligationForm networkName={network.name} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Obligations</h2>
          {obligationsUnavailable ? (
            <p className="rounded-xl border border-dashed border-warning p-6 text-center text-sm text-warning">
              Obligations temporarily unavailable. Try refreshing.
            </p>
          ) : obligations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              None yet. Add one above.
            </p>
          ) : (
            <>
              {/* Below sm: a table this wide just hides Status/Latest decision off-screen behind a
                  scrollbar most people never notice. A stacked card carries the same info without
                  requiring anyone to discover they can scroll a table sideways. */}
              <div className="flex flex-col gap-3 sm:hidden">
                {obligations.map((o) => {
                  const latest = latestDecisionByObligation.get(o.id);
                  return (
                    <div key={o.id} className="rounded-xl border border-border bg-surface p-4 text-sm shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{o.vendorName}</span>
                        <StatusPill status={o.status} />
                      </div>
                      <p className="mt-1 font-mono text-muted">
                        {formatUsdc(o.amount)} <span>{o.currency}</span> <span className="text-muted">· due {o.dueDate}</span>
                      </p>
                      <p className="text-xs text-muted" title={new Date(o.createdAt).toLocaleString()}>
                        Added{" "}
                        {new Date(o.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <div className="mt-2">
                        {latest ? (
                          <div className="flex flex-col gap-1">
                            <DecisionPill action={latest.action} />
                            <span className="text-xs text-muted">{latest.reasoning}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">not yet evaluated</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-sm sm:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-medium">Vendor</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Due</th>
                      <th className="px-4 py-3 font-medium">Added</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Latest decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations.map((o) => {
                      const latest = latestDecisionByObligation.get(o.id);
                      return (
                        <tr key={o.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium">{o.vendorName}</td>
                          <td className="px-4 py-3 font-mono">
                            {formatUsdc(o.amount)} <span className="text-muted">{o.currency}</span>
                          </td>
                          <td className="px-4 py-3 text-muted">{o.dueDate}</td>
                          <td className="px-4 py-3 text-muted" title={new Date(o.createdAt).toLocaleString()}>
                            {new Date(o.createdAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill status={o.status} />
                          </td>
                          <td className="max-w-xs px-4 py-3 text-muted" title={latest?.reasoning}>
                            {latest ? (
                              <div className="flex flex-col gap-1">
                                <DecisionPill action={latest.action} />
                                <span className="truncate text-xs">{latest.reasoning}</span>
                              </div>
                            ) : (
                              <span className="text-xs">not yet evaluated</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Mandates</h2>
            <p className="text-xs text-muted">
              The general settlement primitive · not a side demo. The treasury agent itself is a live funder
              here: every obligation paid above is created and released as its own mandate on{" "}
              <code className="rounded bg-border/40 px-1 py-0.5 font-mono">MandateEscrow</code>, the same
              open contract any other address can fund, fulfill, or read. This list is a live read of
              on-chain state, not this project&apos;s own bookkeeping.
            </p>
          </div>

          {mandatesUnavailable ? (
            <p className="rounded-xl border border-dashed border-warning p-6 text-center text-sm text-warning">
              Mandates temporarily unavailable. Try refreshing.
            </p>
          ) : mandates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              None yet. Deploy{" "}
              <code className="rounded bg-warning-soft px-1.5 py-0.5 font-mono text-xs">MandateEscrow</code>{" "}
              and set MANDATE_ESCROW_ADDRESS, then create one with{" "}
              <code className="rounded bg-warning-soft px-1.5 py-0.5 font-mono text-xs">
                npm run mandate:demo
              </code>
              .
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:hidden">
                {mandates.map((m) => (
                  <div key={m.id} className="rounded-xl border border-border bg-surface p-4 text-sm shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/mandate/${m.id}`} className="font-mono text-accent hover:underline">#{m.id}</Link>
                      <MandateStatusPill status={m.status} />
                    </div>
                    <p className="mt-1 font-mono">${formatUsdc(m.amountUsdc)}</p>
                    <p className="mt-1 text-xs text-muted">
                      funder <Link href={`/address/${m.funder}`} title={m.funder} className="hover:text-foreground hover:underline">{shortAddress(m.funder)}</Link>{isVault(m.funder) && <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">vault</span>} → fulfiller{" "}
                      {/^0x0+$/.test(m.fulfiller) ? "open · unclaimed" : <Link href={`/address/${m.fulfiller}`} title={m.fulfiller} className="hover:text-foreground hover:underline">{shortAddress(m.fulfiller)}</Link>}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {m.fulfillerReputation
                        ? `${m.fulfillerReputation.completed} done · ${m.fulfillerReputation.refunded} refunded · $${formatUsdc(m.fulfillerReputation.volumeSettledUsdc)} settled`
                        : "No reputation yet"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-sm sm:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-medium">#</th>
                      <th className="px-4 py-3 font-medium">Funder</th>
                      <th className="px-4 py-3 font-medium">Fulfiller</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Fulfiller reputation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mandates.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono"><Link href={`/mandate/${m.id}`} className="text-accent hover:underline">{m.id}</Link></td>
                        <td className="px-4 py-3 font-mono" title={m.funder}>
                          <Link href={`/address/${m.funder}`} className="hover:underline">{shortAddress(m.funder)}</Link>{isVault(m.funder) && <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">vault</span>}
                        </td>
                        <td className="px-4 py-3 font-mono" title={m.fulfiller}>
                          {/^0x0+$/.test(m.fulfiller) ? (
                            <span className="text-muted">open · unclaimed</span>
                          ) : (
                            <Link href={`/address/${m.fulfiller}`} className="hover:underline">{shortAddress(m.fulfiller)}</Link>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono">${formatUsdc(m.amountUsdc)}</td>
                        <td className="px-4 py-3">
                          <MandateStatusPill status={m.status} />
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {m.fulfillerReputation ? (
                            <span className="font-mono text-xs">
                              {m.fulfillerReputation.completed} done · {m.fulfillerReputation.refunded} refunded ·
                              ${formatUsdc(m.fulfillerReputation.volumeSettledUsdc)} settled
                            </span>
                          ) : (
                            <span className="text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3 pb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Agent decision log</h2>
          {decisionsUnavailable ? (
            <p className="rounded-xl border border-dashed border-warning p-6 text-center text-sm text-warning">
              Decision log temporarily unavailable. Try refreshing.
            </p>
          ) : decisions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              The agent hasn&apos;t run yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {decisions.map((d) => (
                <li key={d.id} className="rounded-xl border border-border bg-surface p-4 text-sm shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <DecisionPill action={d.action} />
                    <span className="text-xs text-muted">{new Date(d.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-foreground">{d.reasoning}</p>
                  {d.txHash && /^0x[a-fA-F0-9]+$/.test(d.txHash) ? (
                    <a
                      className="mt-2 block break-all font-mono text-xs text-accent hover:underline"
                      href={`${network.blockExplorer}/tx/${d.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.txHash} ↗
                    </a>
                  ) : (
                    d.txHash && (
                      <p className="mt-2 font-mono text-xs text-muted">
                        Submitted, waiting for on-chain confirmation to get a verifiable hash&hellip;
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
