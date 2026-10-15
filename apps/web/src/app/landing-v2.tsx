import Link from "next/link";
import { formatUsdc } from "@/lib/format";
import { GrowBar, LifecycleTabs, Reveal, RollingNumber, StepLoop, type LifecycleItem } from "./landing-motion";

/** Everything the landing page shows that comes from the chain. Null means "could not be read", never a made-up number. */
export interface LandingData {
  vault: {
    balanceUsdc: number;
    availableUsdc: number;
    availablePercent: number;
    perPaymentCapUsdc: number;
    dailyCapUsdc: number;
    allowlistRequired: boolean;
    paused: boolean;
    guardianSet: boolean;
  } | null;
  mandates: number | null;
  released: number | null;
  volumeUsdc: number | null;
  lastPayment: { id: number; amountUsdc: number } | null;
}

const usd = (n: number) => `$${formatUsdc(n)}`;

function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-6 ${className}`}>{children}</div>;
}

// ------------------------------------------------------------------- hero

const HERO_STEPS = [
  { title: "Agent decides to pay", sub: "Due date, balance and reserve checked" },
  { title: "Vault checks the rules", sub: "Cap, daily allowance, allowlist" },
  { title: "Mandate created and released", sub: "One atomic transaction" },
  { title: "Verified on Arc", sub: "Anyone can read it back" },
];

export function HeroV2({ data }: { data: LandingData }) {
  const v = data.vault;
  const balance = v ? usd(v.balanceUsdc) : "$0.00";
  const used = v ? Math.max(0, Math.min(100, 100 - v.availablePercent)) : 0;

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div aria-hidden className="grid-paper absolute inset-0" />
      <div aria-hidden className="hero-orb -left-24 top-10 h-[420px] w-[420px] opacity-40" />
      <div aria-hidden className="hero-orb -right-20 bottom-0 h-[360px] w-[360px] opacity-30" style={{ animationDelay: "-6s" }} />

      <Container className="relative grid items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:py-16">
        <div className="flex flex-col gap-8">
          <span className="pill self-start">
            <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-success" />
            Live on Arc mainnet · source verified
          </span>
          <h1 className="display-xl">
            Autonomous payments with a hard ceiling.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            An agent that pays real invoices on Arc, from a vault it cannot withdraw from. The owner sets the
            limits on-chain, so even a leaked key can only spend what you allowed.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="btn btn-primary btn-pill">
              Open the dashboard
              <span aria-hidden>→</span>
            </Link>
            <Link href="/how-it-works" className="btn btn-outline btn-pill">
              How it is bounded
            </Link>
          </div>
          <p className="text-sm text-muted">
            Open source ·{" "}
            <a
              href="https://github.com/angelraph/arcurrent"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              github.com/angelraph/arcurrent
            </a>
          </p>
        </div>

        {/* Product mockup: the real vault, with the lifecycle card floating over it. */}
        <div className="relative mx-auto flex w-full max-w-[520px] flex-col gap-4 lg:block lg:h-[690px]">
          <div className="card flex flex-col gap-6 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] lg:absolute lg:left-0 lg:right-12 lg:top-16">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Treasury vault</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
                {v?.paused ? "Paused" : "Active"}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Vault balance</span>
              <RollingNumber value={balance} className="text-[clamp(40px,5vw,56px)] font-semibold tracking-[-0.04em]" />
              <span className="text-xs text-muted">USDC on Arc mainnet, read live from the contract</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Daily allowance used</span>
                <span className="font-medium">{v ? `${used.toFixed(0)}% of ${usd(v.dailyCapUsdc)}` : "n/a"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-elevated">
                <GrowBar percent={Math.max(used, 2)} />
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted">Per payment</dt>
                <dd className="text-sm font-semibold">{v ? usd(v.perPaymentCapUsdc) : "n/a"}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted">Available</dt>
                <dd className="text-sm font-semibold">{v ? usd(v.availableUsdc) : "n/a"}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted">Payees</dt>
                <dd className="text-sm font-semibold">{v?.allowlistRequired ? "Allowlist" : "Open"}</dd>
              </div>
            </dl>
          </div>

          <div className="card float-slow flex items-center gap-3 p-4 pr-6 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)] lg:absolute lg:right-0 lg:top-0">
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-base font-bold text-success">
              ✓
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Payment cleared</span>
              <span className="text-xs text-muted">
                {data.lastPayment
                  ? `Mandate #${data.lastPayment.id} · ${usd(data.lastPayment.amountUsdc)} USDC`
                  : "Inside the owner's limits"}
              </span>
            </span>
          </div>

          <div className="card float-slower flex w-full flex-col gap-4 p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.4)] lg:absolute lg:bottom-0 lg:left-8 lg:w-[300px]">
            <span className="text-sm font-semibold">Transaction status</span>
            <StepLoop steps={HERO_STEPS} />
          </div>
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------- proof band

export function StatsBand({ data }: { data: LandingData }) {
  const cells: { label: string; value: string; note: string }[] = [
    {
      label: "Mandates created",
      value: data.mandates !== null ? String(data.mandates) : "n/a",
      note: "On the open MandateEscrow contract",
    },
    {
      label: "USDC settled",
      value: data.volumeUsdc !== null ? usd(data.volumeUsdc) : "n/a",
      note: "Released to payees, read from the chain",
    },
    { label: "Contracts verified", value: "2", note: "Source published on the explorer" },
    { label: "Owner keys held", value: "0", note: "The project never holds the vault owner key" },
  ];
  return (
    <section className="border-b border-border">
      <Container className="py-14 sm:py-20">
        <Reveal>
          <p className="mx-auto mb-10 max-w-2xl text-center text-xl font-medium tracking-[-0.02em] sm:text-2xl">
            Real numbers, read from Arc mainnet when you load the page.
          </p>
        </Reveal>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border lg:grid-cols-4">
          {cells.map((c, i) => (
            <Reveal key={c.label} delay={i * 90} className="bg-surface">
              <div className="flex h-full flex-col gap-2 p-6 sm:p-8">
                <dt className="text-sm text-muted">{c.label}</dt>
                <dd>
                  <RollingNumber
                    value={c.value}
                    className="text-[clamp(34px,4.4vw,52px)] font-semibold tracking-[-0.04em] text-accent"
                  />
                </dd>
                <p className="text-xs leading-relaxed text-muted">{c.note}</p>
              </div>
            </Reveal>
          ))}
        </dl>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------ rules panel

function RuleCard({
  tag,
  title,
  body,
  chips,
}: {
  tag: string;
  title: string;
  body: string;
  chips: string[];
}) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-band-rule bg-white/[0.04] p-6 transition hover:bg-white/[0.07]">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-accent">{tag}</span>
        <h3 className="text-xl font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="text-sm leading-relaxed text-band-muted">{body}</p>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-band-rule pt-4">
        {chips.map((c) => (
          <span key={c} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
            {c}
          </span>
        ))}
      </div>
    </article>
  );
}

export function RulesPanel({ data }: { data: LandingData }) {
  const v = data.vault;
  return (
    <section className="px-4 py-6 sm:px-6 sm:py-10">
      <div className="relative mx-auto w-full max-w-[1200px] overflow-hidden rounded-[28px] bg-band text-band-foreground">
        <div aria-hidden className="hero-orb -left-20 -top-24 h-72 w-72 opacity-50" />
        <div aria-hidden className="hero-orb -bottom-24 right-0 h-72 w-72 opacity-30" style={{ animationDelay: "-5s" }} />
        <div className="relative flex flex-col gap-10 p-7 sm:p-12">
          <Reveal className="flex flex-col gap-4 sm:max-w-2xl">
            <p className="text-xs font-semibold text-accent">The vault</p>
            <h2 className="text-[clamp(28px,4vw,48px)] font-semibold leading-[1.05] tracking-[-0.035em]">
              Rules the agent cannot break.
            </h2>
            <p className="text-base leading-relaxed text-band-muted sm:text-lg">
              The treasury sits in a contract, not in the agent&apos;s wallet. The owner sets four rules on-chain, and
              the vault refuses anything outside them.
            </p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            <Reveal>
              <RuleCard
                tag="Limit"
                title="Per-payment cap"
                body="The largest single payment the vault will release, whatever the agent asks for."
                chips={[v ? `${usd(v.perPaymentCapUsdc)} per payment` : "Set by the owner", "Enforced in the contract"]}
              />
            </Reveal>
            <Reveal delay={80}>
              <RuleCard
                tag="Limit"
                title="Daily allowance"
                body="A rolling 24 hour budget that refills continuously, so there is no midnight reset to game."
                chips={[
                  v ? `${usd(v.dailyCapUsdc)} per day` : "Set by the owner",
                  v ? `${usd(v.availableUsdc)} available now` : "Read live",
                ]}
              />
            </Reveal>
            <Reveal delay={160}>
              <RuleCard
                tag="Control"
                title="Payee allowlist"
                body="The agent can only pay addresses the owner has approved. A new payee needs the owner's signature."
                chips={[v?.allowlistRequired === false ? "Allowlist off" : "Allowlist on", "Owner approves each payee"]}
              />
            </Reveal>
            <Reveal delay={240}>
              <RuleCard
                tag="Control"
                title="Guardian pause"
                body="A separate key that can freeze the vault at once, and cannot move money or change any rule."
                chips={[v?.guardianSet ? "Guardian set" : "Guardian not set", v?.paused ? "Paused now" : "Not paused"]}
              />
            </Reveal>
          </div>
          <Reveal>
            <Link href="/dashboard" className="btn btn-pill self-start bg-white text-black hover:opacity-90">
              See the live vault
              <span aria-hidden>→</span>
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------- worst case

export function WorstCase({ data }: { data: LandingData }) {
  const cap = data.vault?.dailyCapUsdc ?? 5;
  const treasury = 1000;
  const bounded = Math.min(cap, treasury);
  const pct = (bounded / treasury) * 100;
  return (
    <section className="border-b border-border">
      <Container className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20">
        <Reveal className="flex flex-col gap-4">
          <p className="eyebrow">If the agent&apos;s key leaks</p>
          <h2 className="section-title text-[clamp(28px,4vw,46px)]">The worst day has a number, and you chose it.</h2>
          <p className="text-base leading-relaxed text-muted sm:text-lg">
            An agent on a normal wallet can lose everything in that wallet. An agent on an Arcurrent vault can lose
            at most the daily allowance, and only to payees you already approved.
          </p>
        </Reveal>
        <Reveal delay={120} className="card flex flex-col gap-7 p-6 sm:p-8">
          <p className="text-xs text-muted">Example: a {usd(treasury)} treasury, the caps this vault runs on today.</p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Agent key on a plain hot wallet</span>
              <span className="font-semibold text-danger">{usd(treasury)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-elevated">
              <GrowBar percent={100} className="bg-danger" />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Agent key on an Arcurrent vault</span>
              <span className="font-semibold text-success">{usd(bounded)} per day</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-elevated">
              <GrowBar percent={pct} className="bg-success" delay={250} />
            </div>
          </div>
          <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
            That is {pct.toFixed(1)}% of the treasury, with the owner able to pause or replace the operator the moment
            it is noticed. The vault does not judge whether a payment is deserved; it bounds the damage.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}

// --------------------------------------------------------------- lifecycle

export function Lifecycle({ data }: { data: LandingData }) {
  const v = data.vault;
  const items: LifecycleItem[] = [
    {
      key: "set",
      title: "Set the rules",
      body: "A wallet you control funds the vault and sets the caps, the payee allowlist and a pause key.",
      points: [
        "Per-payment and daily caps live in the contract.",
        "Only owner-approved payees can ever be paid.",
        "The project never holds the owner key.",
      ],
      stat: { label: "Daily allowance", value: v ? usd(v.dailyCapUsdc) : "Owner set" },
    },
    {
      key: "decide",
      title: "The agent decides",
      body: "On a schedule it reads what is owed, the vault's real balance and a reserve floor, then pays, waits or holds.",
      points: [
        "Reads the vault balance, not its own wallet.",
        "Keeps a reserve floor so the vault is never drained.",
        "Logs every verdict with its reasoning.",
      ],
      stat: { label: "Decisions are public", value: "Every one" },
    },
    {
      key: "settle",
      title: "The vault pays",
      body: "Inside the rules, one transaction creates and releases a mandate on MandateEscrow. Outside them, it refuses.",
      points: [
        "Pre-flight check says exactly why a payment would fail.",
        "Create and release happen atomically.",
        "A refused payment becomes a logged hold, not a revert.",
      ],
      stat: { label: "Released so far", value: data.released !== null ? String(data.released) : "n/a" },
    },
    {
      key: "verify",
      title: "Anyone verifies",
      body: "Every payment and balance can be read straight from Arc with a few lines, no login and no wallet.",
      points: [
        "Contracts are verified on the explorer.",
        "A copy-paste cast command reads the live state.",
        "An SDK and MCP server make it usable by other agents.",
      ],
      stat: { label: "Mandates on-chain", value: data.mandates !== null ? String(data.mandates) : "n/a" },
    },
  ];

  return (
    <section className="border-b border-border">
      <Container className="flex flex-col gap-10 py-16 sm:py-24">
        <Reveal className="flex max-w-3xl flex-col gap-4">
          <p className="eyebrow">Lifecycle</p>
          <h2 className="section-title text-[clamp(28px,4vw,46px)]">Protection at every step, not one moment.</h2>
          <p className="text-base leading-relaxed text-muted sm:text-lg">
            From the owner&apos;s first rule to the public record of a payment, each stage is enforced by the contract
            or readable by anyone.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <LifecycleTabs items={items} />
        </Reveal>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- audience

const AUDIENCE = [
  {
    tag: "For treasury owners",
    title: "Let software pay the bills, on a short leash.",
    body: "Fund a vault, set the caps, approve the payees. The agent handles the routine payments and you keep the pause switch.",
    href: "/dashboard",
    cta: "Open the dashboard",
  },
  {
    tag: "For agent builders",
    title: "Give your agent a budget, not a private key.",
    body: "An MCP server and a typed SDK let any agent pay through the vault. The vault, not the prompt, is the guardrail.",
    href: "https://www.npmjs.com/org/arcurrent",
    cta: "See the npm packages",
    external: true,
  },
  {
    tag: "For anyone getting paid",
    title: "Send a link. Get paid through escrow.",
    body: "Enter an address and an amount, share the link, and the payer funds a mandate that releases when you deliver.",
    href: "/request",
    cta: "Create a payment request",
  },
];

export function Audience() {
  return (
    <section className="border-b border-border">
      <Container className="flex flex-col gap-10 py-16 sm:py-24">
        <Reveal className="flex max-w-3xl flex-col gap-4">
          <p className="eyebrow">Who it is for</p>
          <h2 className="section-title text-[clamp(28px,4vw,46px)]">One primitive, three ways in.</h2>
        </Reveal>
        <div className="grid gap-4 lg:grid-cols-3">
          {AUDIENCE.map((a, i) => (
            <Reveal key={a.tag} delay={i * 100} className="h-full">
              <article className="card flex h-full flex-col gap-4 p-7 transition hover:-translate-y-1 hover:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.35)]">
                <p className="text-xs font-semibold text-accent">{a.tag}</p>
                <h3 className="text-2xl font-semibold leading-tight tracking-[-0.03em]">{a.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{a.body}</p>
                {a.external ? (
                  <a
                    href={a.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-auto pt-2 text-sm font-semibold text-accent hover:underline"
                  >
                    {a.cta} ↗
                  </a>
                ) : (
                  <Link href={a.href} className="mt-auto pt-2 text-sm font-semibold text-accent hover:underline">
                    {a.cta} →
                  </Link>
                )}
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

// --------------------------------------------------------------- closing CTA

export function ClosingCta() {
  return (
    <section className="px-4 pb-10 pt-6 sm:px-6">
      <Reveal>
        <div className="relative mx-auto flex w-full max-w-[1200px] flex-col items-start gap-6 overflow-hidden rounded-[28px] bg-band p-8 text-band-foreground sm:p-14">
          <div aria-hidden className="hero-orb -right-16 -top-20 h-80 w-80 opacity-60" />
          <h2 className="relative max-w-3xl text-[clamp(30px,4.6vw,56px)] font-semibold leading-[1.04] tracking-[-0.035em]">
            Give your agent a budget, not your keys.
          </h2>
          <p className="relative max-w-xl text-base text-band-muted sm:text-lg">
            Read the live vault, check the contracts yourself, or fund a mandate with your own USDC. Nothing here asks
            you to take it on trust.
          </p>
          <div className="relative flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn btn-pill bg-white text-black hover:opacity-90">
              Open the dashboard
              <span aria-hidden>→</span>
            </Link>
            <Link href="/faq" className="btn btn-pill bg-white/10 text-white hover:bg-white/15">
              Read the FAQ
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
