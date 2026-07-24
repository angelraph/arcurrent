import { getObligations, getRecentDecisions, getTreasuryBalance } from "@/lib/data";
import { formatUsdc } from "@/lib/format";
import { Nav } from "../../nav";
import { ObligationForm } from "../../obligation-form";
import { DecisionPill, StatusPill } from "../../status-pill";
import { ARC_TESTNET } from "@arcurrent/shared";

export const dynamic = "force-dynamic";
// Adding an obligation triggers a real evaluation pass (see actions.ts) --
// possibly a CCTP bridge, which can take a while. Same 60s ceiling as the
// cron route.
export const maxDuration = 60;

export default async function DashboardPage() {
  const [balance, obligations, decisions] = await Promise.all([
    getTreasuryBalance(),
    getObligations(),
    getRecentDecisions(),
  ]);

  const decisionsByObligation = new Map<string, typeof decisions>();
  for (const decision of decisions) {
    const list = decisionsByObligation.get(decision.obligationId) ?? [];
    list.push(decision);
    decisionsByObligation.set(decision.obligationId, list);
  }

  return (
    <div className="flex flex-1 flex-col">
      <Nav />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Live dashboard</span>
          <h2 className="text-2xl font-semibold tracking-tight">Treasury &amp; obligations</h2>
          <p className="text-sm text-muted">Real balances, real obligations, real agent decisions, all on Arc Testnet.</p>
        </div>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Escrow balance <span className="normal-case text-muted">(spendable)</span>
            </h2>
            {balance.escrowUsdc === null ? (
              <p className="mt-2 text-sm text-warning">
                Not configured. Deploy <code className="rounded bg-warning-soft px-1.5 py-0.5 font-mono text-xs">ObligationEscrow</code> and set OBLIGATION_ESCROW_ADDRESS.
              </p>
            ) : (
              <p className="mt-2 font-mono text-3xl font-semibold tracking-tight">
                ${formatUsdc(balance.escrowUsdc)} <span className="text-lg font-medium text-muted">USDC</span>
              </p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Treasury wallet <span className="normal-case text-muted">(undeposited)</span>
            </h2>
            {balance.walletUsdc === null ? (
              <p className="mt-2 text-sm text-warning">
                Not configured. Run <code className="rounded bg-warning-soft px-1.5 py-0.5 font-mono text-xs">npm run setup:wallet</code> and set TREASURY_WALLET_ID.
              </p>
            ) : (
              <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-muted">
                ${formatUsdc(balance.walletUsdc)} <span className="text-lg font-medium text-muted">USDC</span>
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Add obligation</h2>
          <ObligationForm />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Obligations</h2>
          {obligations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              None yet. Add one above.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
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
                    const latest = decisionsByObligation.get(o.id)?.[0];
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
          )}
        </section>

        <section className="flex flex-col gap-3 pb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Agent decision log</h2>
          {decisions.length === 0 ? (
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
                  {d.txHash && (
                    <a
                      className="mt-2 inline-block font-mono text-xs text-accent hover:underline"
                      href={`${ARC_TESTNET.blockExplorer}/tx/${d.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.txHash} ↗
                    </a>
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
