import { ARC_TESTNET } from "@arcurrent/shared";
import { Nav } from "../../nav";
import { CopyAddress } from "../../copy-address";

export const dynamic = "force-dynamic";

/**
 * A direct hand-off to Circle's own public Arc Testnet faucet
 * (faucet.circle.com), not an in-app auto-drip. Circle's faucet-drip API
 * (POST /v1/faucet/drips) rejects Arc Testnet requests from a developer
 * account's own API key regardless of key type (confirmed: 403 for a
 * mainnet-verified key, 403 again after reverting to a testnet key) --
 * distribution for Arc specifically goes through Circle's public,
 * permissionless, reCAPTCHA-gated faucet UI instead, by design. Automating
 * around that CAPTCHA to fake a one-click in-app drip isn't something this
 * app does; this page exists to make the real thing easy to find.
 *
 * Circle's faucet form doesn't support pre-filling the address via a URL
 * param (confirmed: typing an address there doesn't touch window.location),
 * so the best we can do is make copying *our own* configured wallet address
 * a one-click affair instead of a trip through .env.
 */
export default function FaucetPage() {
  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;

  return (
    <div className="flex flex-1 flex-col">
      <Nav />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
        <div className="flex flex-col gap-1" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">Testnet faucet</span>
          <h2 className="text-2xl font-semibold tracking-tight">Get Arc Testnet funds</h2>
          <p className="text-sm text-foreground/80">
            Arc Testnet&apos;s native gas token is USDC itself, so a single faucet request covers
            both gas and app funds. Circle runs the actual faucet, public, free, no account needed,
            we just point you at it.
          </p>
        </div>

        {treasuryAddress && (
          <CopyAddress label="Your treasury wallet (Arc Testnet)" address={treasuryAddress} />
        )}

        <a
          href={ARC_TESTNET.faucet}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-5 text-sm font-semibold text-accent shadow-sm transition hover:bg-background"
        >
          Open Circle&apos;s Arc Testnet faucet ↗
        </a>

        <p className="text-xs text-muted">
          {treasuryAddress
            ? "Copy the address above, click through, paste it into the “Send to” field."
            : "It’ll ask for a wallet address and send testnet USDC straight to it."}{" "}
          Arc Testnet is already selected by default there. Rate-limited by Circle, one request per
          address every 2 hours.
        </p>
      </div>
    </div>
  );
}
