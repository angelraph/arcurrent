import {
  getLatestDecisionByObligation,
  getMandatesWithReputation,
  getObligations,
  getRecentDecisions,
  getVaultOverview,
} from "@/lib/data";
import Link from "next/link";
import { collapseRepeatedDecisions } from "@/lib/decision-display";
import { formatUsdc } from "@/lib/format";
import {
  ActivityChart,
  BalanceHero,
  bucketDecisions,
  DashboardHeader,
  HoldingsCard,
  KpiRow,
  RulesRail,
} from "../../dashboard-parts";
import { AddressChip } from "../../address-chip";
import { DashboardTabs, type DashboardTab } from "../../dashboard-tabs";
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

function Empty({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warning" }) {
  return (
    <p
      className={`rounded-xl border border-dashed p-6 text-center text-sm ${
        tone === "warning" ? "border-warning text-warning" : "border-border text-muted"
      }`}
    >
      {children}
    </p>
  );
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
      getRecentDecisions(60),
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
  // A per-obligation lookup, not windowed by recency, so an older obligation's
  // "latest decision" doesn't disappear just because newer ones logged more
  // since. Falls back to an empty map on failure, the same "not yet evaluated"
  // state as if it genuinely hadn't run, not a scarier error.
  const latestDecisionByObligation =
    latestDecisionsResult.status === "fulfilled" ? latestDecisionsResult.value : new Map<string, AgentDecision>();

  const released = mandates.filter((m) => m.status === "Released");
  const collapsed = collapseRepeatedDecisions(decisions);

  // ------------------------------------------------------------- overview
  const overviewMain = (
    <div className="flex min-w-0 flex-col gap-6">
      <BalanceHero vault={vault} />
      <KpiRow
        k={{
          vaultBalance: vault ? Number(vault.balanceUsdc) : null,
          availableToday: vault ? Number(vault.availableUsdc) : null,
          dailyCap: vault ? Number(vault.dailyCapUsdc) : null,
          mandates: mandatesUnavailable ? null : mandates.length,
          settledUsdc: mandatesUnavailable ? null : released.reduce((sum, m) => sum + m.amountUsdc, 0),
        }}
      />
      <HoldingsCard vault={vault} />
      <ActivityChart buckets={bucketDecisions(decisions)} />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-[-0.01em]">Latest agent decisions</h2>
            <Link href="#log" className="text-xs font-medium text-accent hover:underline">
              See all
            </Link>
          </div>
          {decisionsUnavailable ? (
            <Empty tone="warning">Decision log temporarily unavailable.</Empty>
          ) : collapsed.length === 0 ? (
            <Empty>The agent hasn&apos;t run yet.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {collapsed.slice(0, 5).map((d) => (
                <li key={d.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <DecisionPill action={d.action} reasoning={d.reasoning} />
                    <span className="text-xs text-muted">
                      {new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted">{d.reasoning}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-[-0.01em]">Latest mandates</h2>
            <Link href="#mandates" className="text-xs font-medium text-accent hover:underline">
              See all
            </Link>
          </div>
          {mandatesUnavailable ? (
            <Empty tone="warning">Mandates temporarily unavailable.</Empty>
          ) : mandates.length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {[...mandates]
                .sort((a, b) => b.id - a.id)
                .slice(0, 5)
                .map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-col">
                      <Link href={`/mandate/${m.id}`} className="font-mono text-sm text-accent hover:underline">
                        Mandate #{m.id}
                      </Link>
                      <span className="text-xs text-muted">
                        {isVault(m.funder) ? "Paid by the vault" : `Funded by ${shortAddress(m.funder)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">${formatUsdc(m.amountUsdc)}</span>
                      <MandateStatusPill status={m.status} />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );

  // The rules sit beside the overview, the way a Safe keeps its policy and
  // pending items in a side column, and are not repeated on the other sections.
  const overview = (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      {overviewMain}
      <RulesRail vault={vault} />
    </div>
  );

  // ------------------------------------------------------------ obligations
  const obligationsPanel = (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-[-0.01em]">Add obligation</h2>
          <p className="text-xs text-muted">
            This is this project&apos;s own agent demo · it spends Arcurrent&apos;s treasury, not yours. To try
            MandateEscrow with your own funds instead, use the &ldquo;Use it yourself&rdquo; tab.
          </p>
        </div>
        <ObligationForm networkName={network.name} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-[-0.01em]">Obligations</h2>
        {obligationsUnavailable ? (
          <Empty tone="warning">Obligations temporarily unavailable. Try refreshing.</Empty>
        ) : obligations.length === 0 ? (
          <Empty>None yet. Add one above.</Empty>
        ) : (
          <>
            {/* Below sm: a table this wide just hides Status/Latest decision off-screen behind a
                scrollbar most people never notice. A stacked card carries the same info without
                requiring anyone to discover they can scroll a table sideways. */}
            <div className="flex flex-col gap-3 sm:hidden">
              {obligations.map((o) => {
                const latest = latestDecisionByObligation.get(o.id);
                return (
                  <div key={o.id} className="card p-4 text-sm">
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
                          <DecisionPill action={latest.action} reasoning={latest.reasoning} />
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

            <div className="card hidden overflow-x-auto sm:block">
              <table className="data-table text-sm">
                <thead>
                  <tr className="text-xs">
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
                              <DecisionPill action={latest.action} reasoning={latest.reasoning} />
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
    </div>
  );

  // --------------------------------------------------------------- mandates
  const mandatesPanel = (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-[-0.01em]">Mandates</h2>
        <p className="text-xs text-muted">
          The general settlement primitive · not a side demo. Every obligation the agent pays is created and
          released as its own mandate on{" "}
          <code className="rounded bg-border/40 px-1 py-0.5 font-mono">MandateEscrow</code>, the same open contract
          any other address can fund, fulfill, or read. This list is a live read of on-chain state.
        </p>
      </div>

      {mandatesUnavailable ? (
        <Empty tone="warning">Mandates temporarily unavailable. Try refreshing.</Empty>
      ) : mandates.length === 0 ? (
        <Empty>
          None yet. Deploy{" "}
          <code className="rounded bg-warning-soft px-1.5 py-0.5 font-mono text-xs">MandateEscrow</code> and set
          MANDATE_ESCROW_ADDRESS, then create one with{" "}
          <code className="rounded bg-warning-soft px-1.5 py-0.5 font-mono text-xs">npm run mandate:demo</code>.
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:hidden">
            {mandates.map((m) => (
              <div key={m.id} className="card p-4 text-sm">
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

          <div className="card hidden overflow-x-auto sm:block">
            <table className="data-table text-sm">
              <thead>
                <tr className="text-xs">
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
                        <span className="text-xs">n/a</span>
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
  );

  // -------------------------------------------------------------- agent log
  const logPanel = (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold tracking-[-0.01em]">Agent decision log</h2>
      {decisionsUnavailable ? (
        <Empty tone="warning">Decision log temporarily unavailable. Try refreshing.</Empty>
      ) : decisions.length === 0 ? (
        <Empty>The agent hasn&apos;t run yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {collapsed.map((d) => (
            <li key={d.id} className="card p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <DecisionPill action={d.action} reasoning={d.reasoning} />
                <span className="text-xs text-muted">{new Date(d.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-foreground">{d.reasoning}</p>
              {d.repeats > 0 && d.since && (
                <p className="mt-1 text-xs text-muted">
                  Same verdict recorded {d.repeats} more time{d.repeats === 1 ? "" : "s"} since{" "}
                  {new Date(d.since).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.
                </p>
              )}
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
  );

  // The open, self-serve path (a wallet, your own funds) lives in its own
  // tab, and is the one a ?mandate= link opens straight onto.
  const tabs: DashboardTab[] = [
    { key: "overview", label: "Overview", content: overview },
    { key: "vault", label: "Vault", content: <VaultPanel vault={vault} unavailable={vaultUnavailable} /> },
    { key: "obligations", label: "Obligations", count: obligations.length, content: obligationsPanel },
    { key: "mandates", label: "Mandates", count: mandates.length, content: mandatesPanel },
    { key: "log", label: "Agent log", content: logPanel },
    {
      key: "use-it",
      label: "Use it yourself",
      content: (
        <div className="flex flex-col gap-6">
          <WalletMandatePanel initialMandateId={initialMandateId} />
          <VaultOwnerPanel />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <DashboardHeader vault={vault} lastCheckedIn={decisions[0]?.createdAt ?? null} />

      <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
        <DashboardTabs
          tabs={tabs}
          initial={initialMandateId ? "use-it" : "overview"}
          footer={
            <div className="flex flex-col gap-3 border-t border-border pt-5">
              <span className="text-xs font-medium text-muted">Contracts</span>
              {vault && (
                <AddressChip
                  address={vault.address}
                  label="Vault"
                  explorerUrl={`${network.blockExplorer}/address/${vault.address}?tab=contract`}
                />
              )}
              {process.env.NEXT_PUBLIC_MANDATE_ESCROW_ADDRESS && (
                <AddressChip
                  address={process.env.NEXT_PUBLIC_MANDATE_ESCROW_ADDRESS}
                  label="Escrow"
                  explorerUrl={`${network.blockExplorer}/address/${process.env.NEXT_PUBLIC_MANDATE_ESCROW_ADDRESS}?tab=contract`}
                />
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
