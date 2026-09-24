import Link from "next/link";

export function SectionHeader({
  id,
  eyebrow,
  title,
  intro,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-3" id={id}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="section-title">{title}</h2>
      {intro && <p className="text-base leading-relaxed text-muted sm:text-lg">{intro}</p>}
    </div>
  );
}

export function Section({ children, id, tinted }: { children: React.ReactNode; id?: string; tinted?: boolean }) {
  return (
    <section id={id} className={`border-b border-border ${tinted ? "bg-surface/50" : ""}`}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-6 py-16 sm:py-20">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- live strip

export interface LiveStats {
  mandates: number;
  released: number;
  volumeUsdc: string;
}

/** Numbers read from the chain at request time, so the strip can only ever tell the truth. */
export function LiveStrip({ stats }: { stats: LiveStats | null }) {
  const cells = [
    { label: "Mandates on-chain", value: stats ? String(stats.mandates) : "…" },
    { label: "Released", value: stats ? String(stats.released) : "…" },
    { label: "USDC settled", value: stats ? `$${stats.volumeUsdc}` : "…" },
    { label: "Contracts verified", value: "2" },
  ];
  return (
    <div className="border-b border-border bg-surface/60">
      <dl className="mx-auto grid w-full max-w-[1200px] grid-cols-2 px-6 sm:grid-cols-4">
        {cells.map((c, i) => (
          <div
            key={c.label}
            className={`flex flex-col gap-1 py-5 ${i > 0 ? "sm:border-l sm:border-border sm:pl-6" : ""} ${i % 2 === 1 ? "border-l border-border pl-6 sm:pl-6" : ""}`}
          >
            <dt className="label-mono">{c.label}</dt>
            <dd className="font-display text-2xl font-medium tracking-[-0.02em]">{c.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// -------------------------------------------------------------- how it works

const STEPS = [
  {
    n: "01",
    title: "The owner sets the rules",
    body: "A wallet you control funds the vault and sets a per-payment cap, a daily cap, the payees the agent may pay, and a pause switch.",
  },
  {
    n: "02",
    title: "The agent decides",
    body: "It reads what is owed, checks the vault's real balance, the due date and a reserve floor, and decides to pay, wait, or hold.",
  },
  {
    n: "03",
    title: "The vault pays, atomically",
    body: "Inside the rules, one transaction creates and releases a mandate on MandateEscrow. Outside them, the vault refuses and the agent logs why.",
  },
  {
    n: "04",
    title: "Anyone can check",
    body: "Every payment, mandate and balance is read straight from Arc, with a link to the explorer. Nothing is taken on trust.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeader
        eyebrow="How it works"
        title="A treasury that runs itself, on a short leash."
        intro="The agent decides and acts alone. The vault is what keeps that safe."
      />
      <ol className="grid grid-cols-1 border-y border-border sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className={`flex flex-col gap-3 py-7 sm:px-6 ${i > 0 ? "border-t border-border sm:border-t-0" : ""} ${
              i % 2 === 1 ? "sm:border-l sm:border-border" : ""
            } ${i > 0 ? "lg:border-l lg:border-border" : ""} ${i >= 2 ? "sm:border-t sm:border-border lg:border-t-0" : ""} ${i === 0 ? "sm:pl-0" : ""}`}
          >
            <span className="eyebrow">{s.n}</span>
            <h3 className="font-display text-xl font-medium leading-snug tracking-[-0.02em]">{s.title}</h3>
            <p className="text-sm leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ---------------------------------------------------------------- why arc

export function WhyArc() {
  return (
    <Section id="why">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <SectionHeader eyebrow="Why a blockchain, and why Arc" title="An agent needs money it can prove it controls." />
        <div className="flex flex-col gap-5 text-base leading-relaxed text-muted">
          <p>
            A normal payments API needs a human, or a trusted middleman, to authorize every transfer. An agent
            that decides and acts on its own, on a schedule, with no one watching, needs something else: money
            that lives somewhere it can prove it controls without a password handed to it each time, and a
            permanent record of every decision, so a wrong payment is provable rather than a &quot;trust
            us&quot; in a database.
          </p>
          <p>
            Arc is built for exactly this. Gas is paid in USDC, the same money moving through the system,
            rather than a separate token to keep topped up, and settlement finishes in under a second, so
            checking a balance every few minutes does not cost more than the payments themselves.
          </p>
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------- bounded autonomy

const SCENARIOS = [
  {
    label: "If this leaks",
    title: "The agent's credentials",
    can: "Spend as the operator, and nothing else.",
    limit:
      "The per-payment cap, the daily cap and the payee allowlist bound every call. It cannot withdraw. The owner pauses the vault or replaces the operator at once.",
  },
  {
    label: "If this leaks",
    title: "The owner wallet",
    can: "Everything in the vault.",
    limit:
      "Only the owner's own key hygiene: a hardware wallet or a multisig, and a small balance. This is why the owner is never a key in a config file.",
  },
  {
    label: "If this breaks",
    title: "The vault contract",
    can: "Lose up to the vault balance.",
    limit:
      "Fuzz and mutation-tested code, a verified source anyone can read, a small balance, and the plain statement that it is not professionally audited.",
  },
];

export function BoundedAutonomy() {
  return (
    <Section id="bounded" tinted>
      <SectionHeader
        eyebrow="Bounded autonomy"
        title="What each failure costs you, stated up front."
        intro="The vault turns an unbounded risk into a number you chose. Here is the honest version of every way it can go wrong."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
          <article key={s.title} className="flex flex-col gap-4 rounded-xl bg-panel p-6">
            <p className="eyebrow">{s.label}</p>
            <h3 className="font-display text-2xl font-medium leading-tight tracking-[-0.02em]">{s.title}</h3>
            <div className="flex flex-col gap-1">
              <p className="label-mono">An attacker can</p>
              <p className="text-sm font-medium">{s.can}</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="label-mono">What limits it</p>
              <p className="text-sm leading-relaxed text-muted">{s.limit}</p>
            </div>
          </article>
        ))}
      </div>
      <article className="grid gap-6 rounded-xl bg-plum p-7 text-plum-foreground sm:p-9 lg:grid-cols-[1fr_1.4fr] lg:gap-12">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">What it does not do</p>
          <h3 className="font-display text-2xl font-medium leading-tight tracking-[-0.02em]">
            It cannot tell whether a payment is deserved.
          </h3>
        </div>
        <p className="text-sm leading-relaxed opacity-80 sm:text-base">
          A compromised agent can still spend up to the caps on payees the rules allow. The guarantee is a bounded
          worst case that the owner picked, not good judgement. That is why the caps are small, the allowlist is
          on, and the vault is meant to hold a modest balance.
        </p>
      </article>
    </Section>
  );
}

// ------------------------------------------------------------ build on it

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.65] text-[#e8ecf4]">
      <code>{children}</code>
    </pre>
  );
}

const k = "text-[#f39a36]"; // keywords pick up the Arc warm tone
const s = "text-[#7cc4ff]"; // strings pick up the Arc blue
const c = "text-[#8890a0]"; // comments stay quiet

export function BuildOnIt() {
  return (
    <Section id="build">
      <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="flex flex-col gap-8">
          <SectionHeader
            eyebrow="Build on it"
            title="Not project-owned. Any address, any agent."
            intro="MandateEscrow has no owner, no allowlist and no fee. Use it from a browser wallet, from code, or hand it to an AI agent as tools."
          />
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {[
              ["TypeScript SDK", "Typed reads and writes with spend caps, exact-amount approvals and simulate-first errors."],
              ["MCP server", "Read-only by default. In vault mode its only payment tool is one call the vault bounds on-chain."],
              ["Payment-request links", "Put in an address and an amount, send the link, and get paid through escrow."],
            ].map(([t, d]) => (
              <li key={t} className="flex flex-col gap-1 py-4">
                <span className="text-sm font-semibold">{t}</span>
                <span className="text-sm text-muted">{d}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Link href="/request" className="btn btn-outline">
              Make a payment request
            </Link>
            <a
              href="https://github.com/angelraph/arcurrent/tree/main/packages/mandate-sdk"
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
            >
              Read the SDK docs ↗
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#101627]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-2.5">
              <span className="font-mono text-xs text-[#8890a0]">agent.ts</span>
              <span className="font-mono text-xs text-[#f39a36]">VaultClient</span>
            </div>
            <Code>
              <span className={k}>const</span> agent = VaultClient.<span className={k}>fromPrivateKey</span>(key, {"{"}
              {"\n"}  vaultAddress: <span className={s}>&quot;0x8B4e…27B5&quot;</span>,{"\n"}
              {"}"});{"\n\n"}
              <span className={c}>{"// Ask first: no gas, and it says exactly why not."}</span>
              {"\n"}
              <span className={k}>const</span> check = <span className={k}>await</span> agent.<span className={k}>checkPay</span>({"{"}
              {"\n"}  to: vendor, amountUsdc: <span className={s}>&quot;0.5&quot;</span>,{"\n"}
              {"}"});{"\n\n"}
              <span className={c}>{"// One atomic transaction, inside the owner's rules."}</span>
              {"\n"}
              <span className={k}>await</span> agent.<span className={k}>pay</span>({"{"} to: vendor, amountUsdc: <span className={s}>&quot;0.5&quot;</span> {"}"});
            </Code>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#101627]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-2.5">
              <span className="font-mono text-xs text-[#8890a0]">mcp config</span>
              <span className="font-mono text-xs text-[#f39a36]">vault mode</span>
            </div>
            <Code>
              {"{"} <span className={s}>&quot;env&quot;</span>: {"{"}
              {"\n"}  <span className={s}>&quot;MANDATE_VAULT_ADDRESS&quot;</span>: <span className={s}>&quot;0x8B4e…27B5&quot;</span>,
              {"\n"}  <span className={s}>&quot;MANDATE_PRIVATE_KEY&quot;</span>: <span className={s}>&quot;operator key, gas only&quot;</span>,
              {"\n"}  <span className={s}>&quot;MANDATE_ENABLE_WRITES&quot;</span>: <span className={s}>&quot;true&quot;</span>
              {"\n"}{"}"} {"}"}
            </Code>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------- under the hood

const PARTS = [
  {
    name: "Circle wallet, as the operator",
    detail:
      "The agent signs from a real Circle-custodied wallet, Live environment, that holds only gas. No private key lives in this codebase, and the wallet holds nothing worth stealing.",
  },
  {
    name: "AgentVault",
    detail:
      "The treasury lives in a contract. The owner sets the caps, the allowlist and the pause switch; the agent can only pay inside them and can never withdraw.",
  },
  {
    name: "MandateEscrow",
    detail:
      "Every payment is its own mandate on a permissionless contract: fund it, prove fulfillment, release atomically, with a reputation ledger that updates on-chain.",
  },
  {
    name: "x402 nanopayments",
    detail:
      "Before acting on a foreign-currency bill, the agent pays a sub-cent fee to a rate oracle for the live exchange rate. A real, working micropayment.",
  },
  {
    name: "App Kit and CCTP",
    detail:
      "The agent can bridge USDC in from another chain when the vault runs low. Proven on testnet; disabled on mainnet until a funded source wallet exists.",
  },
  {
    name: "Signed webhooks",
    detail:
      "Circle confirms each transaction with a signed webhook, verified before an obligation is marked settled, so the record follows the chain and not the other way round.",
  },
];

export function UnderTheHood() {
  return (
    <Section id="stack">
      <SectionHeader
        eyebrow="Under the hood"
        title="Real parts, wired into one loop."
        intro="Built directly against Circle's primitives and Arc's contracts, not a starter kit, since the loop itself is the product."
      />
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {PARTS.map((p) => (
          <div key={p.name} className="flex flex-col gap-2 bg-surface p-6">
            <h3 className="font-display text-lg font-medium leading-snug tracking-[-0.015em]">{p.name}</h3>
            <p className="text-sm leading-relaxed text-muted">{p.detail}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
