import Link from "next/link";
import { getActiveArcNetwork } from "@arcurrent/shared";

const linkClass = "text-sm font-medium text-muted transition hover:text-foreground";

export function Nav() {
  const network = getActiveArcNetwork();
  return (
    <>
      <div
        className="px-4 py-2 text-center text-[13px] font-medium leading-snug text-white"
        style={{ background: "linear-gradient(90deg, #6a1841 0%, #a62f4b 40%, #d85a35 78%, #f39a36 100%)" }}
      >
        AgentVault is live on Arc mainnet: the agent pays inside limits you set on-chain.{" "}
        <Link href="/#bounded" className="underline decoration-white/50 underline-offset-2 hover:decoration-white">
          See how it is bounded
        </Link>
      </div>
      <header className="border-b border-border bg-surface/90 px-6 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <Link href="/" className="flex items-center gap-2">
              <img src="/arcurrent-icon.png" alt="" className="h-7 w-7 object-contain" />
              <span className="font-display text-xl font-semibold tracking-[-0.03em]">Arcurrent</span>
            </Link>
            <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <Link href="/dashboard" className={linkClass}>
                Dashboard
              </Link>
              <Link href="/#roadmap" className={linkClass}>
                Roadmap
              </Link>
              <Link href="/#faq" className={linkClass}>
                FAQ
              </Link>
              <Link href="/deck" className={linkClass}>
                Pitch deck
              </Link>
              {network.faucet && (
                <Link href="/faucet" className={linkClass}>
                  Testnet faucet
                </Link>
              )}
            </nav>
          </div>
          <span className="label-mono rounded-[4px] border border-border px-2 py-1 normal-case tracking-normal">
            {network.name} · chain {network.chainId}
          </span>
        </div>
      </header>
    </>
  );
}
