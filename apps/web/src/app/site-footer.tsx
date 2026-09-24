import Link from "next/link";

const REPO = "https://github.com/angelraph/arcurrent";
const EXPLORER = "https://explorer.arc.io";

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-band-foreground">{title}</h3>
      <ul className="flex flex-col gap-2 text-sm font-light text-[var(--band-muted)]">{children}</ul>
    </div>
  );
}

const linkClass = "transition hover:text-band-foreground";

function Internal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className={linkClass}>
        {children}
      </Link>
    </li>
  );
}

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
        {children} ↗
      </a>
    </li>
  );
}

/**
 * Full-width closing band, the way a ledger ends: a short statement, a rule,
 * then the sitemap. Server component; contract links follow the same public
 * env vars the rest of the app already uses.
 */
export function SiteFooter() {
  const escrow = process.env.NEXT_PUBLIC_MANDATE_ESCROW_ADDRESS;
  const vault = process.env.NEXT_PUBLIC_VAULT_ADDRESS;

  return (
    <footer className="mt-20 border-t border-[var(--band-rule)] bg-band text-band-foreground">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-14">
        <div className="flex flex-col gap-6 pb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-xl flex-col gap-3">
            <p className="eyebrow">Live on Arc mainnet</p>
            <p className="font-display text-2xl font-medium leading-snug tracking-[-0.02em] sm:text-3xl">
              An agent that pays on time, inside limits you set on-chain.
            </p>
          </div>
          <Link href="/dashboard" className="btn btn-primary w-fit">
            Open the dashboard
          </Link>
        </div>

        <div className="border-t border-[var(--band-rule)] pt-10">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <Column title="Product">
              <Internal href="/dashboard">Dashboard</Internal>
              <Internal href="/request">Payment request links</Internal>
              <Internal href="/deck">Pitch deck</Internal>
              <Internal href="/#roadmap">Roadmap</Internal>
              <Internal href="/#faq">FAQ</Internal>
            </Column>
            <Column title="Build on it">
              <External href={`${REPO}/tree/main/packages/mandate-sdk`}>TypeScript SDK</External>
              <External href={`${REPO}/tree/main/packages/mandate-mcp`}>MCP server</External>
              <External href={`${REPO}/tree/main/packages/contracts/contracts`}>Contract source</External>
              <External href={REPO}>GitHub repository</External>
            </Column>
            <Column title="Verify">
              {escrow && <External href={`${EXPLORER}/address/${escrow}?tab=contract`}>MandateEscrow contract</External>}
              {vault && <External href={`${EXPLORER}/address/${vault}?tab=contract`}>AgentVault contract</External>}
              <External href={`${REPO}/blob/main/docs/STACK.md`}>Security self-review</External>
              <External href={EXPLORER}>Arc explorer</External>
            </Column>
            <Column title="Project">
              <External href={`${REPO}/blob/main/LICENSE`}>MIT license</External>
              <External href="https://dorahacks.io/hackathon/arc-microgrants">Arc Microgrants</External>
              <External href="https://docs.arc.io">Arc docs</External>
            </Column>
          </div>

          <p className="mt-10 max-w-3xl text-xs font-light leading-relaxed text-[var(--band-muted)]">
            Arcurrent moves real USDC on Arc mainnet. The contracts are self-reviewed and unit, fuzz and mutation
            tested, but not professionally audited, so keep balances small. Nothing here is financial advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
