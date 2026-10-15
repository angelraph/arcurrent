import Link from "next/link";
import { getActiveArcNetwork } from "@arcurrent/shared";
import { NavLinks } from "./nav-links";

export function Nav() {
  const network = getActiveArcNetwork();
  return (
    <>
      <div className="border-b border-border bg-surface/60 px-4 py-2 text-center text-xs text-muted">
        <span className="inline-flex flex-wrap items-center justify-center gap-x-2">
          <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-success" />
          AgentVault is live on {network.name}: the agent pays only inside limits set on-chain.
          <Link href="/how-it-works#bounded" className="font-medium text-foreground underline underline-offset-2">
            How it is bounded
          </Link>
        </span>
      </div>
      <header className="border-b border-border px-6">
        <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <img src="/arcurrent-icon.png" alt="" className="h-7 w-7 object-contain" />
              <span className="text-lg font-semibold tracking-[-0.02em]">Arcurrent</span>
            </Link>
            <div className="hidden md:block">
              <NavLinks faucet={Boolean(network.faucet)} />
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg bg-elevated px-3 py-2 text-xs font-medium">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
            {network.name}
            <span className="hidden text-muted sm:inline">· chain {network.chainId}</span>
          </span>
        </div>
        <div className="mx-auto w-full max-w-[1200px] overflow-x-auto md:hidden [&_a]:!h-11 [&_a]:whitespace-nowrap">
          <NavLinks faucet={Boolean(network.faucet)} />
        </div>
      </header>
    </>
  );
}
