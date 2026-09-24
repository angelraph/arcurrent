import { getActiveArcNetwork } from "@arcurrent/shared";
import type { VaultOverview } from "@/lib/data";
import { formatUsdc } from "@/lib/format";
import { AddressLink } from "./detail-parts";

const LOW_GAS_USDC = 0.05;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-mono text-lg font-semibold">{value}</dd>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * The treasury and the rules that bound the agent, straight from the vault
 * contract. Public on purpose: the point of a spending policy is that anyone
 * can check what the agent is and is not allowed to do.
 */
export function VaultPanel({ vault, unavailable }: { vault: VaultOverview | null; unavailable: boolean }) {
  const explorer = getActiveArcNetwork().blockExplorer;
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Agent vault</h2>
          {vault && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                vault.paused ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
              }`}
            >
              {vault.paused ? "Paused" : "Active"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          The treasury lives in a contract, not in the agent&apos;s wallet. The agent can only pay inside the
          limits below, set by the owner, and can never withdraw. Read live from the chain.
        </p>
      </div>

      {unavailable ? (
        <p className="text-sm text-warning">Vault data is temporarily unavailable. Try refreshing.</p>
      ) : !vault ? (
        <p className="text-sm text-warning">
          Not configured. Deploy an AgentVault and set VAULT_ADDRESS (see the README).
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Vault balance" value={`$${formatUsdc(Number(vault.balanceUsdc))}`} hint="What the agent can pay from" />
            <Stat label="Per payment" value={`$${formatUsdc(Number(vault.perPaymentCapUsdc))}`} hint="Most it can send at once" />
            <Stat label="Per day" value={`$${formatUsdc(Number(vault.dailyCapUsdc))}`} hint="Refills continuously" />
            <Stat
              label="Payees"
              value={vault.allowlistRequired ? "Allowlist" : "Any"}
              hint={vault.allowlistRequired ? "Owner approves each one" : "Only the caps bound it"}
            />
          </dl>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-muted">Daily allowance available right now</span>
              <span className="font-mono">
                ${formatUsdc(Number(vault.availableUsdc))} of ${formatUsdc(Number(vault.dailyCapUsdc))}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={Math.round(vault.availablePercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Daily allowance available"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, vault.availablePercent)}%` }} />
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium uppercase tracking-wide text-muted">Owner</dt>
              <dd><AddressLink address={vault.owner} /></dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium uppercase tracking-wide text-muted">Agent (operator)</dt>
              <dd><AddressLink address={vault.operator} /></dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium uppercase tracking-wide text-muted">Guardian (can pause)</dt>
              <dd>{/^0x0+$/.test(vault.guardian) ? <span className="text-muted">none</span> : <AddressLink address={vault.guardian} />}</dd>
            </div>
          </dl>

          {vault.gasFloatUsdc !== null && (
            <p className={`text-xs ${vault.gasFloatUsdc < LOW_GAS_USDC ? "text-warning" : "text-muted"}`}>
              Agent gas float: ${formatUsdc(vault.gasFloatUsdc)} USDC.{" "}
              {vault.gasFloatUsdc < LOW_GAS_USDC
                ? "Running low: the agent's wallet needs a little USDC to pay transaction fees."
                : "That wallet only pays fees; it holds none of the treasury."}
            </p>
          )}

          <p className="text-xs text-muted">
            Vault contract{" "}
            <a
              href={`${explorer}/address/${vault.address}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent hover:underline"
            >
              {vault.address.slice(0, 6)}…{vault.address.slice(-4)} ↗
            </a>
            . The vault cannot judge whether a payment is deserved, only bound how much a compromised agent could send.
          </p>
        </>
      )}
    </section>
  );
}
