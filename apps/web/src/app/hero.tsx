import Link from "next/link";

export function Hero() {
  return (
    <section
      className="border-b border-border px-6 py-20 text-center sm:py-28"
      style={{ background: "linear-gradient(to bottom, var(--accent-soft), var(--background))" }}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent shadow-sm" style={{ textShadow: "none" }}>
          Live on Arc mainnet
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          An open settlement primitive, and the autonomous agent that&apos;s already using it.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-foreground sm:text-lg">
          Arcurrent&apos;s treasury agent watches what you owe and decides when it&apos;s safe to pay from
          real signals. It pays from an on-chain vault it can never withdraw from and can only spend
          inside limits its owner set, so even leaked credentials are bounded by numbers you chose. Every
          payment is a mandate on <span className="font-mono text-sm">MandateEscrow</span>, an open,
          permissionless contract any address can fund, fulfill, or read. No human clicks approve, and
          every settlement is real, on Arc mainnet, and independently verifiable on-chain.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/deck"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90"
          >
            View the pitch deck →
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-background"
          >
            Open the dashboard
          </Link>
          <a
            href="https://github.com/angelraph/arcurrent"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-background"
          >
            View source on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
