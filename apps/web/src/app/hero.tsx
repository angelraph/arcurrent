import Link from "next/link";
import { RailDiagram } from "./rail-diagram";

const CAPABILITIES = [
  { title: "Open contract", sub: "Source verified on the explorer" },
  { title: "Bounded agent", sub: "Limits it can never exceed" },
  { title: "SDK and MCP", sub: "For any project or AI agent" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div aria-hidden className="grid-paper absolute inset-0" />
      <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-12 px-6 py-16 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:py-24">
        <div className="flex flex-col gap-7">
          <p className="eyebrow">Live on Arc mainnet · source verified</p>
          <h1 className="display text-[clamp(34px,4.3vw,56px)]">
            An open settlement primitive, and the autonomous agent that&apos;s already using it.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-foreground/85 sm:text-lg">
            An agent that pays real invoices on Arc mainnet, from a vault it cannot withdraw from. Its
            owner sets the limits on-chain, so even a leaked key can only spend what you allowed. Every
            payment is a mandate on <span className="font-mono text-[0.9em]">MandateEscrow</span>, an open
            contract anyone can fund, fulfil or read.
          </p>

          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {CAPABILITIES.map((c) => (
              <li key={c.title} className="flex items-center gap-2.5">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-[2px] bg-accent" />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">{c.title}</span>
                  <span className="text-xs text-muted">{c.sub}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link href="/dashboard" className="btn btn-primary">
              Open the dashboard →
            </Link>
            <Link href="/deck" className="btn btn-outline">
              View the pitch deck
            </Link>
            <a
              href="https://github.com/angelraph/arcurrent"
              target="_blank"
              rel="noreferrer"
              className="px-1 text-sm font-semibold text-muted transition hover:text-foreground"
            >
              Source on GitHub ↗
            </a>
          </div>
        </div>

        <RailDiagram />
      </div>
    </section>
  );
}
