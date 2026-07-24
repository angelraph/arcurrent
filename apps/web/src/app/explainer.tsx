const KITS = [
  {
    name: "Developer-Controlled Wallets",
    detail:
      "The treasury and liquidity wallets are real Circle-custodied wallets the agent signs from directly. No private key lives in this codebase.",
  },
  {
    name: "App Kit / Bridge Kit (CCTP)",
    detail:
      "When the balance runs low, the agent bridges USDC in from a second wallet on another chain, live, via Circle's Cross-Chain Transfer Protocol.",
  },
  {
    name: "x402 nanopayments",
    detail:
      "Before acting on a foreign-currency bill, the agent pays a sub-cent fee to a rate oracle for the live exchange rate. It's a real, working micropayment, not a placeholder.",
  },
  {
    name: "A deployed smart contract",
    detail:
      "ObligationEscrow holds the treasury's USDC on-chain and only lets the agent's wallet withdraw from it, so the payment history is independently verifiable and not just rows in a database.",
  },
];

export function Explainer() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16 sm:py-20">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Why does this need a blockchain?</h3>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          A normal payments API needs a human, or a trusted middleman, to authorize every transfer.
          Arcurrent can&apos;t work that way. The whole point is that it decides and acts on its own, on
          a schedule, with no one watching. That only works if the money it moves lives somewhere it can
          prove it controls without a password handed to it each time, every decision leaves a
          permanent record so a wrong payment is provable rather than a &quot;trust us&quot; in a
          database, and settlement is fast and cheap enough that checking a balance every few minutes
          doesn&apos;t cost more than the payments themselves. Arc is built for exactly this. Gas is
          paid in USDC, the same money moving through the system, rather than a separate token you have
          to keep topped up, and settlement finishes in under a second.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-foreground">What&apos;s actually running under the hood</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {KITS.map((kit) => (
            <div key={kit.name} className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">{kit.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{kit.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-foreground">What to do next</h3>
        <ol className="flex flex-col gap-2 text-sm text-muted">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              1
            </span>
            Add an obligation below: a vendor, an amount, a due date, USDC or EURC.
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              2
            </span>
            Watch the decision log. The agent evaluates it against the real treasury balance and
            reserve floor, then either pays it, waits, or bridges in more USDC first if the balance
            would run short.
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              3
            </span>
            Click any transaction hash to verify it yourself on Arc Testnet Explorer. Nothing here is
            simulated.
          </li>
        </ol>
      </div>
    </section>
  );
}
