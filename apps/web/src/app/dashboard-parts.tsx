import Link from "next/link";
import { getActiveArcNetwork } from "@arcurrent/shared";
import type { VaultOverview } from "@/lib/data";
import { formatUsdc } from "@/lib/format";
import { AddressChip } from "./address-chip";
import { AgentHeartbeat } from "./agent-heartbeat";
import { GrowBar, Reveal, RollingNumber } from "./landing-motion";

const usd = (n: number) => `$${formatUsdc(n)}`;

/** The same deterministic avatar the address chips use, at header size. */
function avatarGradient(address: string): string {
  const n = parseInt(address.slice(2, 14), 16);
  const h1 = n % 360;
  const h2 = (h1 + 55 + ((n >> 8) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 65% 55%), hsl(${h2} 70% 40%))`;
}

// ------------------------------------------------------------------ header

/**
 * The identity band that opens the page: whose treasury this is, on which
 * network, and whether its agent is alive. The way a Safe names the account
 * before it shows a single number.
 */
export function DashboardHeader({
  vault,
  lastCheckedIn,
}: {
  vault: VaultOverview | null;
  lastCheckedIn: string | null;
}) {
  const network = getActiveArcNetwork();
  return (
    <header className="relative overflow-hidden border-b border-border">
      <div aria-hidden className="grid-paper absolute inset-0 opacity-70" />
      <div aria-hidden className="hero-orb -left-20 -top-24 h-72 w-72 opacity-30" />
      <div className="relative mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-6 px-6 py-8 sm:py-10">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="h-14 w-14 shrink-0 rounded-2xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]"
            style={{ background: vault ? avatarGradient(vault.address) : "var(--elevated)" }}
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.03em]">Arcurrent Treasury</h1>
              {vault && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    vault.paused ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                  }`}
                >
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${vault.paused ? "bg-danger" : "bg-success"}`} />
                  {vault.paused ? "Paused" : "Active"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {vault && (
                <AddressChip
                  address={vault.address}
                  explorerUrl={`${network.blockExplorer}/address/${vault.address}?tab=contract`}
                />
              )}
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-elevated px-2.5 py-1.5 text-xs font-medium text-foreground">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
                {network.name}
              </span>
              {vault && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg bg-elevated px-2.5 py-1.5 text-xs font-medium text-foreground"
                  title="Owner, agent operator and guardian: three separate keys with different powers"
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <circle cx="8" cy="5.5" r="2.5" />
                    <path d="M3 13c.6-2.4 2.5-3.6 5-3.6s4.4 1.2 5 3.6" />
                  </svg>
                  {/^0x0+$/.test(vault.guardian) ? "2 roles" : "3 roles"}
                </span>
              )}
              {vault && (
                <span className="inline-flex items-center rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent">
                  {usd(Number(vault.balanceUsdc))}
                </span>
              )}
            </div>
          </div>
        </div>
        <AgentHeartbeat lastCheckedIn={lastCheckedIn} />
      </div>
    </header>
  );
}

// --------------------------------------------------------------------- KPIs

export interface DashboardKpis {
  vaultBalance: number | null;
  availableToday: number | null;
  dailyCap: number | null;
  mandates: number | null;
  settledUsdc: number | null;
}

function Kpi({
  label,
  value,
  note,
  delay,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  delay: number;
  accent?: boolean;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div className="card flex h-full flex-col gap-2 p-5">
        <span className="text-xs font-medium text-muted">{label}</span>
        <RollingNumber
          value={value}
          className={`text-[clamp(26px,2.6vw,34px)] font-semibold tracking-[-0.035em] ${accent ? "text-accent" : ""}`}
        />
        <span className="text-xs text-muted">{note}</span>
      </div>
    </Reveal>
  );
}

export function KpiRow({ k }: { k: DashboardKpis }) {
  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Kpi
        label="Available today"
        value={k.availableToday !== null ? usd(k.availableToday) : "n/a"}
        note={k.dailyCap !== null ? `of ${usd(k.dailyCap)} daily limit` : "Rolling daily limit"}
        delay={0}
      />
      <Kpi
        label="USDC settled"
        value={k.settledUsdc !== null ? usd(k.settledUsdc) : "n/a"}
        note="Released to payees on-chain"
        delay={70}
      />
      <Kpi
        label="Mandates"
        value={k.mandates !== null ? String(k.mandates) : "n/a"}
        note="On the open MandateEscrow"
        delay={140}
      />
    </section>
  );
}

// ------------------------------------------------------------ balance hero

/**
 * The first thing on the overview, the way a Safe opens on its total
 * balance: one large figure with the cents de-emphasised, when it was last
 * read, and the three things an owner actually does next.
 */
export function BalanceHero({ vault }: { vault: VaultOverview | null }) {
  const network = getActiveArcNetwork();
  const balance = vault ? usd(Number(vault.balanceUsdc)) : "n/a";
  return (
    <section className="card relative overflow-hidden p-6 sm:p-8">
      <div aria-hidden className="hero-orb -right-16 -top-20 h-64 w-64 opacity-25" />
      <div className="relative flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-sm text-muted">
            Vault balance
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-success" />
              Read live from {network.name}
            </span>
          </span>
          <RollingNumber
            value={balance}
            fadeDecimals
            className="text-[clamp(44px,6vw,68px)] font-semibold leading-none tracking-[-0.045em]"
          />
          <span className="text-sm text-muted">USDC the agent can pay from. It can never withdraw it.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="#obligations" className="btn btn-primary">
            Add obligation
          </Link>
          <Link href="#use-it" className="btn btn-outline">
            Fund the vault
          </Link>
          {vault && (
            <a
              href={`${network.blockExplorer}/address/${vault.address}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
            >
              View on explorer ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- holdings

function Coin({ label, tone }: { label: string; tone: string }) {
  return (
    <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone}`}>
      {label}
    </span>
  );
}

/** Where the money and the gas actually sit, as rows, like a Safe's top assets. */
export function HoldingsCard({ vault }: { vault: VaultOverview | null }) {
  const rows = vault
    ? [
        {
          coin: <Coin label="$" tone="bg-accent-soft text-accent" />,
          name: "USDC in the vault",
          sub: "The treasury, held by the contract",
          value: usd(Number(vault.balanceUsdc)),
        },
        {
          coin: <Coin label="⛽" tone="bg-warning-soft text-warning" />,
          name: "Agent gas float",
          sub: "In the agent's wallet, fees only",
          value: vault.gasFloatUsdc !== null ? usd(vault.gasFloatUsdc) : "n/a",
        },
        {
          coin: <Coin label="↻" tone="bg-success-soft text-success" />,
          name: "Allowance available",
          sub: `Refills continuously, ${usd(Number(vault.dailyCapUsdc))} a day`,
          value: usd(Number(vault.availableUsdc)),
        },
      ]
    : [];
  return (
    <section className="card flex flex-col gap-4 p-6">
      <h2 className="text-base font-semibold tracking-[-0.01em]">Holdings</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-warning">Vault data is temporarily unavailable.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              {r.coin}
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-sm font-semibold">{r.name}</span>
                <span className="truncate text-xs text-muted">{r.sub}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------ allowance ring

/** The daily allowance as a ring, drawn in SVG so it needs no script to render. */
export function AllowanceRing({ percent, centerLabel }: { percent: number; centerLabel: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" role="img" aria-label={`${Math.round(clamped)}% of the daily allowance remaining`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--elevated)" strokeWidth="12" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          className="ring-draw"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="text-2xl font-semibold tracking-[-0.03em]">{Math.round(clamped)}%</span>
        <span className="text-[11px] text-muted">{centerLabel}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rules rail

function RuleLine({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-2 font-medium">
        {ok !== undefined && (
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-warning"}`} />
        )}
        {value}
      </span>
    </div>
  );
}

/**
 * The right-hand rail: the rules that bound the agent, always visible beside
 * whichever tab is open. Mirrors a Safe's policy summary.
 */
export function RulesRail({ vault }: { vault: VaultOverview | null }) {
  const noGuardian = vault ? /^0x0+$/.test(vault.guardian) : true;
  const used = vault ? Math.max(0, 100 - vault.availablePercent) : 0;
  return (
    <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
      <section className="card flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-[-0.01em]">Spending rules</h2>
          <p className="text-xs leading-relaxed text-muted">Set by the owner on-chain. The vault refuses anything outside them.</p>
        </div>
        {vault ? (
          <>
            <div className="flex items-center gap-5">
              <AllowanceRing percent={vault.availablePercent} centerLabel="available" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">Daily allowance</span>
                <span className="text-xl font-semibold tracking-[-0.03em]">{usd(Number(vault.dailyCapUsdc))}</span>
                <span className="text-xs text-muted">{used.toFixed(0)}% used</span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-elevated">
              <GrowBar percent={Math.max(vault.availablePercent, 2)} />
            </div>
            <div className="flex flex-col divide-y divide-border border-t border-border">
              <RuleLine label="Per payment" value={usd(Number(vault.perPaymentCapUsdc))} />
              <RuleLine label="Payees" value={vault.allowlistRequired ? "Allowlist on" : "Any address"} ok={vault.allowlistRequired} />
              <RuleLine label="Guardian" value={noGuardian ? "Not set" : "Set"} ok={!noGuardian} />
              <RuleLine label="Status" value={vault.paused ? "Paused" : "Running"} ok={!vault.paused} />
            </div>
          </>
        ) : (
          <p className="text-sm text-warning">Vault data is temporarily unavailable.</p>
        )}
      </section>

      <section className="relative overflow-hidden rounded-2xl bg-band p-5 text-band-foreground">
        <div aria-hidden className="hero-orb -right-10 -top-14 h-40 w-40 opacity-50" />
        <div className="relative flex flex-col gap-3">
          <h2 className="text-base font-semibold tracking-[-0.01em]">Try it with your own funds</h2>
          <p className="text-xs leading-relaxed text-band-muted">
            MandateEscrow is open. Connect a wallet and fund a mandate yourself. It never touches this treasury.
          </p>
          <Link href="#use-it" className="btn bg-white text-black hover:opacity-90">
            Open the escrow tool
          </Link>
        </div>
      </section>
    </aside>
  );
}

// ------------------------------------------------------------- activity chart

export interface DayBucket {
  day: string;
  paid: number;
  other: number;
}

/**
 * Agent verdicts per day for the last two weeks, from the real decision log.
 * Payments are the accent colour; every other verdict is muted, so the
 * rhythm of the agent is visible at a glance.
 */
export function ActivityChart({ buckets }: { buckets: DayBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.paid + b.other));
  return (
    <section className="card flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-[-0.01em]">Agent activity</h2>
          <p className="text-xs text-muted">Verdicts logged per day, last {buckets.length} days.</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-sm bg-success" /> Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-sm bg-accent/50" /> Held or waited
          </span>
        </div>
      </div>
      <div className="flex h-36 items-end gap-1.5 sm:gap-2" role="img" aria-label="Agent verdicts per day">
        {buckets.map((b, i) => {
          const total = b.paid + b.other;
          const h = (total / max) * 100;
          return (
            <div key={b.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${b.day}: ${total} verdict${total === 1 ? "" : "s"}`}>
              <div
                className="bar-grow flex w-full flex-col justify-end overflow-hidden rounded-t-md"
                style={{ height: `${Math.max(total === 0 ? 3 : h, 3)}%`, animationDelay: `${i * 40}ms` }}
              >
                {total === 0 ? (
                  <div className="h-full w-full bg-elevated" />
                ) : (
                  <>
                    {b.other > 0 && <div className="w-full bg-accent/50" style={{ height: `${(b.other / total) * 100}%` }} />}
                    {b.paid > 0 && <div className="w-full bg-success" style={{ height: `${(b.paid / total) * 100}%` }} />}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{buckets[0]?.day}</span>
        <span>{buckets[buckets.length - 1]?.day}</span>
      </div>
    </section>
  );
}

/** Buckets decisions into the last `days` UTC days, oldest first. */
export function bucketDecisions(decisions: { action: string; createdAt: string }[], days = 14, now = new Date()): DayBucket[] {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const out: (DayBucket & { k: string })[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push({ k: key(d), day: fmt(d), paid: 0, other: 0 });
  }
  const index = new Map(out.map((b, i) => [b.k, i]));
  for (const d of decisions) {
    const at = index.get(d.createdAt.slice(0, 10));
    if (at === undefined) continue;
    if (d.action === "pay_now") out[at].paid += 1;
    else out[at].other += 1;
  }
  return out.map(({ day, paid, other }) => ({ day, paid, other }));
}
