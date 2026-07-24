import Link from "next/link";
import { ARC_TESTNET } from "@arcurrent/shared";

export function Nav() {
  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">
              A
            </span>
            <h1 className="text-xl font-semibold tracking-tight">Arcurrent</h1>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-muted">
            <Link href="/deck" className="transition hover:text-foreground">
              Pitch deck
            </Link>
            <Link href="/dashboard" className="transition hover:text-foreground">
              Dashboard
            </Link>
          </nav>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted">
          Arc Testnet · chain {ARC_TESTNET.chainId}
        </span>
      </div>
    </header>
  );
}
