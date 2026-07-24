import Link from "next/link";

export function Hero() {
  return (
    <section
      className="border-b border-border px-6 py-20 text-center sm:py-28"
      style={{ background: "linear-gradient(to bottom, var(--accent-soft), var(--background))" }}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent shadow-sm">
          Autonomous treasury agent on Arc
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          An agent that pays your company&apos;s bills and proves every decision on-chain.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Arcurrent watches what you owe, decides when it&apos;s safe to pay from real signals, and
          settles in USDC without anyone clicking approve. This isn&apos;t a demo. Every transaction is
          real, on Arc Testnet, and anyone can verify it.
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
