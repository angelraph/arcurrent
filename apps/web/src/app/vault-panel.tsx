import { getActiveArcNetwork } from "@arcurrent/shared";
import type { VaultOverview } from "@/lib/data";
import { formatUsdc } from "@/lib/format";
import { AddressChip } from "./address-chip";

const LOW_GAS_USDC = 0.05;

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-background p-4">
      <dt className="label-mono">{label}</dt>
      <dd className="metric">{value}</dd>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function RoleRow({
  role,
  note,
  address,
  explorer,
}: {
  role: string;
  note: string;
  address: string | null;
  explorer: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{role}</span>
        <span className="text-xs text-muted">{note}</span>
      </div>
      {address ? (
        <AddressChip address={address} explorerUrl={`${explorer}/address/${address}`} />
      ) : (
        <span className="rounded-lg bg-elevated px-3 py-1.5 text-sm text-muted">Not set</span>
      )}
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
  const noGuardian = vault ? /^0x0+$/.test(vault.guardian) : true;

  return (
    <section className="card flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Treasury</h2>
            {vault && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  vault.paused ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                }`}
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${vault.paused ? "bg-danger" : "bg-success"}`} />
                {vault.paused ? "Paused" : "Active"}
              </span>
            )}
          </div>
          <p className="max-w-xl text-sm text-muted">
            Funds sit in the AgentVault contract, not in the agent&apos;s wallet. The agent can only pay inside the
            limits below and can never withdraw. Read live from the chain.
          </p>
        </div>
        {vault && <AddressChip address={vault.address} explorerUrl={`${explorer}/address/${vault.address}?tab=contract`} label="Vault" />}
      </div>

      {unavailable ? (
        <p className="text-sm text-warning">Vault data is temporarily unavailable. Try refreshing.</p>
      ) : !vault ? (
        <p className="text-sm text-warning">Not configured. Deploy an AgentVault and set VAULT_ADDRESS (see the README).</p>
      ) : (
        <>
          {Number(vault.balanceUsdc) === 0 && (
            <p className="rounded-lg bg-background px-4 py-3 text-sm text-muted">
              Not yet funded, by design. The treasury stays empty until the project has real adoption to justify
              holding funds; the caps, allowlist and pause it would be bound by are already live on this contract and
              covered by 32 automated tests. To try the mechanism today with real money, in your own custody, use
              MandateEscrow with your own wallet: it never touches this vault.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Vault balance" value={`$${formatUsdc(Number(vault.balanceUsdc))}`} hint="What the agent can pay from" />
            <Metric label="Available today" value={`$${formatUsdc(Number(vault.availableUsdc))}`} hint={`of $${formatUsdc(Number(vault.dailyCapUsdc))} daily limit`} />
            <Metric label="Per payment" value={`$${formatUsdc(Number(vault.perPaymentCapUsdc))}`} hint="Most it can send at once" />
            <Metric
              label="Payees"
              value={vault.allowlistRequired ? "Allowlist" : "Any"}
              hint={vault.allowlistRequired ? "Owner approves each one" : "Only the caps bound it"}
            />
          </dl>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-muted">Daily allowance remaining</span>
              <span className="font-mono">{Math.round(vault.availablePercent)}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-elevated"
              role="progressbar"
              aria-valuenow={Math.round(vault.availablePercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Daily allowance remaining"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, vault.availablePercent)}%` }} />
            </div>
            <p className="text-xs text-muted">The allowance refills continuously, so there is no midnight reset to game.</p>
          </div>

          <div className="flex flex-col divide-y divide-border border-t border-border pt-1">
            <RoleRow role="Owner" note="Sets the limits, funds and can withdraw" address={vault.owner} explorer={explorer} />
            <RoleRow role="Agent (operator)" note="Can only call pay(), inside the limits" address={vault.operator} explorer={explorer} />
            <RoleRow
              role="Guardian"
              note="Can pause everything; cannot spend or resume"
              address={noGuardian ? null : vault.guardian}
              explorer={explorer}
            />
          </div>

          {vault.gasFloatUsdc !== null && (
            <p className={`text-xs ${vault.gasFloatUsdc < LOW_GAS_USDC ? "text-warning" : "text-muted"}`}>
              Agent gas float: ${formatUsdc(vault.gasFloatUsdc)} USDC.{" "}
              {vault.gasFloatUsdc < LOW_GAS_USDC
                ? "Running low: the agent's wallet needs a little USDC to pay transaction fees."
                : "That wallet only pays fees; it holds none of the treasury."}
            </p>
          )}

          <p className="text-xs text-muted">
            The vault cannot judge whether a payment is deserved, only bound how much a compromised agent could send.
          </p>
        </>
      )}
    </section>
  );
}
