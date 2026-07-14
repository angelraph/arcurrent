import { getObligations, getRecentDecisions, getTreasuryBalance } from "@/lib/data";
import { ObligationForm } from "./obligation-form";
import { ARC_TESTNET } from "@arcurrent/shared";

export const dynamic = "force-dynamic";

export default async function Home() {
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
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Arcurrent</h1>
        <span className="text-sm text-zinc-500">Arc Testnet — chain {ARC_TESTNET.chainId}</span>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-500">Treasury balance</h2>
        {balance === null ? (
          <p className="mt-1 text-lg text-amber-600">
            Not configured — run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run setup:wallet</code> and set TREASURY_WALLET_ID.
          </p>
        ) : (
          <p className="mt-1 text-2xl font-semibold">${balance.toFixed(2)} USDC</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Add obligation</h2>
        <ObligationForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Obligations</h2>
        {obligations.length === 0 ? (
          <p className="text-sm text-zinc-500">None yet — add one above.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Latest decision</th>
                </tr>
              </thead>
              <tbody>
                {obligations.map((o) => {
                  const latest = decisionsByObligation.get(o.id)?.[0];
                  return (
                    <tr key={o.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-3 py-2">{o.vendorName}</td>
                      <td className="px-3 py-2">{o.amount.toFixed(2)} {o.currency}</td>
                      <td className="px-3 py-2">{o.dueDate}</td>
                      <td className="px-3 py-2">{o.status}</td>
                      <td className="max-w-xs px-3 py-2 text-zinc-600 dark:text-zinc-400" title={latest?.reasoning}>
                        {latest ? `${latest.action} — ${latest.reasoning}` : "not yet evaluated"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Agent decision log</h2>
        {decisions.length === 0 ? (
          <p className="text-sm text-zinc-500">The agent hasn't run yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {decisions.map((d) => (
              <li key={d.id} className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div className="flex justify-between text-zinc-500">
                  <span>{d.action}</span>
                  <span>{new Date(d.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1">{d.reasoning}</p>
                {d.txHash && (
                  <a
                    className="mt-1 inline-block font-mono text-xs text-blue-600 dark:text-blue-400"
                    href={`${ARC_TESTNET.blockExplorer}/tx/${d.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.txHash}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
