"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { isAddress, parseAbi } from "viem";
import { agentVaultAbi, formatUsdc, parseUsdc } from "@arcurrent/mandate-sdk";
import { USDC_ADDRESS, USDC_DECIMALS, VAULT_ADDRESS, wagmiConfig } from "@/lib/wagmi-config";
import { AccountBar, ConnectGate, shortErrorMessage, TxResult, type TxState } from "./wallet-mandate-panel";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const erc20TransferAbi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-accent";
const buttonClass =
  "rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50";
const quietButtonClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:bg-background disabled:opacity-50";

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <h3 className="label-mono">{title}</h3>
      {note && <p className="text-xs text-muted">{note}</p>}
      {children}
    </div>
  );
}

function requireAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value.trim(), { strict: false })) throw new Error(`${label} must be a valid 0x address.`);
  return value.trim() as `0x${string}`;
}

/**
 * The owner's controls for the treasury vault. Everything here is a normal
 * wallet transaction signed by the connected wallet, and the contract itself
 * refuses anyone who is not the owner, so this panel adds no authority: it is
 * only a friendlier way to call functions that already exist. Not the owner?
 * It says so and shows nothing to click.
 */
export function VaultOwnerPanel() {
  if (!VAULT_ADDRESS) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="label-mono">Vault owner controls</h2>
        <p className="text-xs text-muted">
          Only the vault&apos;s owner can change the rules, fund it, or withdraw. Connect the owner wallet to
          use these; anyone else can look but not touch.
        </p>
      </div>
      <ConnectGate>
        <div className="flex flex-col gap-3">
          <AccountBar />
          <OwnerControls vault={VAULT_ADDRESS} />
        </div>
      </ConnectGate>
    </section>
  );
}

function OwnerControls({ vault }: { vault: `0x${string}` }) {
  const { address } = useAccount();
  const router = useRouter();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<TxState>({});
  const [busy, setBusy] = useState(false);

  const { data: policy, refetch } = useReadContract({ address: vault, abi: agentVaultAbi, functionName: "policy" });
  const { data: pendingOwner, refetch: refetchPending } = useReadContract({ address: vault, abi: agentVaultAbi, functionName: "pendingOwner" });

  const [perPayment, setPerPayment] = useState("");
  const [daily, setDaily] = useState("");
  const [payee, setPayee] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [operatorInput, setOperatorInput] = useState("");
  const [guardianInput, setGuardianInput] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const me = address?.toLowerCase();
  const isOwner = !!policy && me === policy.owner.toLowerCase();
  const isGuardian = !!policy && me === policy.guardian.toLowerCase();
  const isPending = !!pendingOwner && pendingOwner !== ZERO_ADDRESS && me === pendingOwner.toLowerCase();

  async function run(fn: () => Promise<`0x${string}`>, done: string) {
    setState({});
    setBusy(true);
    try {
      const hash = await fn();
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setState({ success: done, txHash: hash });
      await Promise.all([refetch(), refetchPending()]);
      router.refresh();
    } catch (err) {
      setState({ error: shortErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  // Building the call validates the inputs (a thrown error becomes the on-screen
  // message); run() then sends it and waits for the receipt.
  function act(build: () => Promise<`0x${string}`>, done: string) {
    return () => {
      void run(build, done);
    };
  }

  if (!policy) return <p className="text-xs text-muted">Reading the vault…</p>;

  if (!isOwner && !isGuardian && !isPending) {
    return (
      <p className="text-xs text-warning">
        This wallet is not the vault owner ({policy.owner.slice(0, 6)}…{policy.owner.slice(-4)}), so it can&apos;t change anything here.
      </p>
    );
  }

  const write = (functionName: string, args: unknown[]) => () =>
    writeContractAsync({ address: vault, abi: agentVaultAbi, functionName, args } as never);

  return (
    <div className="flex flex-col gap-3">
      {isPending && (
        <Group title="Ownership handover" note="The current owner has offered you ownership of this vault. Nothing changes until you accept.">
          <button type="button" disabled={busy} className={buttonClass} onClick={act(write("acceptOwnership", []), "You are now the vault owner.")}>
            Accept ownership
          </button>
        </Group>
      )}

      {(isOwner || isGuardian) && (
        <Group
          title={policy.paused ? "Payments are paused" : "Emergency stop"}
          note={
            policy.paused
              ? "The agent cannot pay anything while paused. Only the owner can resume; the owner can still withdraw."
              : "Stops every payment immediately. The owner or the guardian can do this; only the owner can resume."
          }
        >
          {policy.paused ? (
            isOwner && (
              <button type="button" disabled={busy} className={buttonClass} onClick={act(write("unpause", []), "Payments resumed.")}>
                Resume payments
              </button>
            )
          ) : (
            <button type="button" disabled={busy} className={quietButtonClass} onClick={act(write("pause", []), "Payments paused.")}>
              Pause all payments
            </button>
          )}
        </Group>
      )}

      {isOwner && (
        <>
          <Group title="Spending limits" note={`Now: $${formatUsdc(policy.perPaymentCap, USDC_DECIMALS)} per payment, $${formatUsdc(policy.dailyCap, USDC_DECIMALS)} per day. Lowering a limit clamps the current allowance; raising it refills gradually, not instantly.`}>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-muted">
                Per payment (USDC)
                <input value={perPayment} onChange={(e) => setPerPayment(e.target.value)} inputMode="decimal" placeholder={formatUsdc(policy.perPaymentCap, USDC_DECIMALS)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-muted">
                Per day (USDC)
                <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" placeholder={formatUsdc(policy.dailyCap, USDC_DECIMALS)} className={inputClass} />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              className={`${buttonClass} w-fit`}
              onClick={act(async () => {
                const p = parseUsdc(perPayment || formatUsdc(policy.perPaymentCap, USDC_DECIMALS), USDC_DECIMALS);
                const d = parseUsdc(daily || formatUsdc(policy.dailyCap, USDC_DECIMALS), USDC_DECIMALS);
                if (p <= 0n) throw new Error("The per-payment limit must be greater than zero.");
                if (d < p) throw new Error("The daily limit must be at least the per-payment limit.");
                return write("setLimits", [p, d])();
              }, "Limits updated.")}
            >
              Update limits
            </button>
          </Group>

          <Group
            title="Who the agent may pay"
            note={
              policy.allowlistRequired
                ? "Allowlist is ON: the agent can only pay addresses you approve here. An obligation to anyone else is held until you do."
                : "Allowlist is OFF: the agent can pay any address, bounded only by the limits."
            }
          >
            <label className="text-xs font-medium text-muted">
              Payee address
              <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" className={inputClass} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={buttonClass} onClick={act(async () => write("setPayee", [requireAddress(payee, "Payee"), true])(), "Payee approved.")}>
                Approve payee
              </button>
              <button type="button" disabled={busy} className={quietButtonClass} onClick={act(async () => write("setPayee", [requireAddress(payee, "Payee"), false])(), "Payee removed.")}>
                Remove payee
              </button>
              <button type="button" disabled={busy} className={quietButtonClass} onClick={act(write("setAllowlistRequired", [!policy.allowlistRequired]), policy.allowlistRequired ? "Allowlist turned off." : "Allowlist turned on.")}>
                {policy.allowlistRequired ? "Turn allowlist off" : "Turn allowlist on"}
              </button>
            </div>
          </Group>

          <Group title="Fund the vault" note={`Sends USDC from your wallet into the vault. Holds $${formatUsdc(policy.balance, USDC_DECIMALS)} now. Keep it modest: the vault is not professionally audited.`}>
            <label className="text-xs font-medium text-muted">
              Amount (USDC)
              <input value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} inputMode="decimal" className={inputClass} />
            </label>
            <button
              type="button"
              disabled={busy}
              className={`${buttonClass} w-fit`}
              onClick={act(async () => {
                const amount = parseUsdc(fundAmount, USDC_DECIMALS);
                if (amount <= 0n) throw new Error("The amount must be greater than zero.");
                return writeContractAsync({ address: USDC_ADDRESS, abi: erc20TransferAbi, functionName: "transfer", args: [vault, amount] });
              }, "Vault funded.")}
            >
              Fund vault
            </button>
          </Group>

          <Group title="Withdraw" note="Works even while paused. Sends USDC from the vault to any address you choose.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted">
                To
                <input value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} placeholder={address} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-muted">
                Amount (USDC)
                <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} inputMode="decimal" className={inputClass} />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              className={`${quietButtonClass} w-fit`}
              onClick={act(async () => {
                const to = requireAddress(withdrawTo || address || "", "Destination");
                const amount = parseUsdc(withdrawAmount, USDC_DECIMALS);
                if (amount <= 0n) throw new Error("The amount must be greater than zero.");
                if (amount > policy.balance) throw new Error(`The vault only holds $${formatUsdc(policy.balance, USDC_DECIMALS)}.`);
                return write("withdraw", [to, amount])();
              }, "Withdrawn.")}
            >
              Withdraw
            </button>
          </Group>

          <Group title="Agent and guardian wallets" note="The operator is the agent's signing wallet. Replacing or removing it cuts off the old one immediately.">
            <label className="text-xs font-medium text-muted">
              New operator
              <input value={operatorInput} onChange={(e) => setOperatorInput(e.target.value)} placeholder={policy.operator} className={inputClass} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={buttonClass} onClick={act(async () => write("setOperator", [requireAddress(operatorInput, "Operator")])(), "Operator replaced.")}>
                Replace operator
              </button>
              <button type="button" disabled={busy} className={quietButtonClass} onClick={act(write("setOperator", [ZERO_ADDRESS]), "Operator removed; payments are frozen until a new one is set.")}>
                Remove operator (freeze)
              </button>
            </div>
            <label className="text-xs font-medium text-muted">
              Guardian (can pause, never resume)
              <input value={guardianInput} onChange={(e) => setGuardianInput(e.target.value)} placeholder={policy.guardian} className={inputClass} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={buttonClass} onClick={act(async () => write("setGuardian", [requireAddress(guardianInput, "Guardian")])(), "Guardian set.")}>
                Set guardian
              </button>
              <button type="button" disabled={busy} className={quietButtonClass} onClick={act(write("setGuardian", [ZERO_ADDRESS]), "Guardian removed.")}>
                Remove guardian
              </button>
            </div>
          </Group>

          <Group title="Hand over ownership" note="Two steps: you offer, the new owner accepts. Nothing moves until they do. Double-check the address; it cannot be undone once accepted.">
            <label className="text-xs font-medium text-muted">
              New owner
              <input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x…" className={inputClass} />
            </label>
            <button type="button" disabled={busy} className={`${quietButtonClass} w-fit`} onClick={act(async () => write("transferOwnership", [requireAddress(newOwner, "New owner")])(), "Ownership offered. The new owner must accept it.")}>
              Offer ownership
            </button>
          </Group>
        </>
      )}

      <TxResult state={state} />
    </div>
  );
}
