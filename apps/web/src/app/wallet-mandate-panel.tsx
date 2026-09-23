"use client";

import { useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { decodeEventLog, isAddress, keccak256, parseAbi, parseUnits, stringToHex, formatUnits } from "viem";
import { useRouter } from "next/navigation";
import { arcMainnet, MANDATE_ESCROW_ADDRESS, USDC_ADDRESS, USDC_DECIMALS, wagmiConfig } from "@/lib/wagmi-config";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Deliberately not imported from @arcurrent/shared -- that package pulls in
 * @circle-fin/developer-controlled-wallets (Node-only, Circle API calls),
 * which has no business in a browser bundle. This is the small client-safe
 * slice of the same ABI, duplicated on purpose.
 */
const mandateEscrowAbi = parseAbi([
  "function createMandate(address fulfiller, uint256 amount, uint256 deadline) returns (uint256)",
  "function submitProof(uint256 mandateId, bytes32 proofHash)",
  "function release(uint256 mandateId, address[] destinations, uint256[] amounts)",
  "function refund(uint256 mandateId)",
  "function mandates(uint256) view returns (address funder, address fulfiller, uint256 amount, uint256 deadline, bytes32 proofHash, uint8 status)",
  "event MandateCreated(uint256 indexed mandateId, address indexed funder, address indexed fulfiller, uint256 amount, uint256 deadline)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

const STATUS_NAMES = ["None", "Funded", "Fulfilled", "Released", "Refunded"] as const;

function isValidAddress(v: string): v is `0x${string}` {
  return isAddress(v);
}

/** Trims wallet/RPC error messages down to their first line -- the rest is usually a stack trace or raw calldata nobody reading this UI needs. */
function shortErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message.split("\n")[0] : "Transaction failed or was rejected.";
}

function ConnectGate({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();

  if (!isConnected) {
    // Deliberately not gated behind a pre-check like `typeof window.ethereum
    // !== "undefined"` -- that was tried and is a real false-negative trap:
    // some wallets inject asynchronously (checked too early = wrongly
    // "not found"), and modern EIP-6963 wallets don't always shim
    // `window.ethereum` for legacy compat the way MetaMask does, so a wallet
    // can genuinely be installed and working while that check still says no.
    // The actual connect() attempt below is the real source of truth; a
    // missing-provider error surfaces via `error` after a real attempt,
    // not a guess beforehand.
    const connector = connectors[0];
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={() => connector && connect({ connector })}
          disabled={isPending || !connector}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        {error && (
          <p className="text-xs text-danger">
            {shortErrorMessage(error)}
            {/no provider|not found/i.test(error.message) && (
              <>
                {" "}
                No wallet extension found ·{" "}
                <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-accent underline">
                  install MetaMask
                </a>{" "}
                or any EIP-1193 wallet, then reload this page.
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  if (chainId !== arcMainnet.id) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-warning">Your wallet is on the wrong network.</p>
        <button
          type="button"
          onClick={() => switchChain({ chainId: arcMainnet.id })}
          disabled={switching}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {switching ? "Switching…" : "Switch to Arc"}
        </button>
        {switchError && <p className="text-xs text-danger">{shortErrorMessage(switchError)}</p>}
      </div>
    );
  }

  return <>{children}</>;
}

function AccountBar() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-xs">
      <span className="font-mono text-muted">
        {address?.slice(0, 6)}…{address?.slice(-4)} ·{" "}
        {balance !== undefined ? `$${formatUnits(balance, USDC_DECIMALS)} USDC` : "…"}
      </span>
      <button type="button" onClick={() => disconnect()} className="text-muted underline hover:text-foreground">
        Disconnect
      </button>
    </div>
  );
}

interface TxState {
  error?: string;
  success?: string;
  txHash?: `0x${string}`;
}

/** Same explorer link pattern used in the agent decision log below on this page -- so a wallet-connect action is just as verifiable as an agent one. */
function TxResult({ state }: { state: TxState }) {
  if (!state.error && !state.success) return null;
  return (
    <div className="flex flex-col gap-1">
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      {state.success && <p className="text-xs text-success">{state.success}</p>}
      {state.txHash && (
        <a
          href={`${arcMainnet.blockExplorers.default.url}/tx/${state.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="break-all font-mono text-xs text-accent hover:underline"
        >
          {state.txHash} ↗
        </a>
      )}
    </div>
  );
}

function CreateMandateForm() {
  const { address } = useAccount();
  const router = useRouter();
  const [fulfiller, setFulfiller] = useState("");
  const [amount, setAmount] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const [state, setState] = useState<TxState>({});
  const [step, setStep] = useState<"idle" | "approving" | "creating">("idle");
  const { writeContractAsync } = useWriteContract();

  const amountAtomic = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    try {
      return parseUnits(amount, USDC_DECIMALS);
    } catch {
      return null;
    }
  }, [amount]);

  // Narrowed into a local const, not used directly from the module import --
  // TypeScript doesn't propagate a truthiness guard on an imported binding
  // into closures defined later in this component (handleSubmit below),
  // even though it's a module-level `const` that can't actually change.
  const escrowAddress = MANDATE_ESCROW_ADDRESS;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && escrowAddress ? [address, escrowAddress] : undefined,
    query: { enabled: !!address && !!escrowAddress },
  });

  if (!escrowAddress) {
    return <p className="text-sm text-warning">MandateEscrow address not configured (NEXT_PUBLIC_MANDATE_ESCROW_ADDRESS).</p>;
  }

  const fulfillerAddress: `0x${string}` = fulfiller.trim() === "" ? ZERO_ADDRESS : (fulfiller.trim() as `0x${string}`);
  const fulfillerValid = fulfiller.trim() === "" || isValidAddress(fulfiller.trim());
  const needsApproval = amountAtomic !== null && (allowance === undefined || allowance < amountAtomic);
  const busy = step !== "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({});

    // Redundant at runtime (the component already returned above if this
    // were falsy) -- TypeScript doesn't carry that outer narrowing into a
    // closure, so it needs its own guard right here.
    if (!escrowAddress) return;

    if (!fulfillerValid) {
      setState({ error: "Fulfiller must be a valid 0x address, or left blank for an open mandate." });
      return;
    }
    if (amountAtomic === null) {
      setState({ error: "Amount must be a positive number." });
      return;
    }

    const deadlineSeconds =
      deadlineDays.trim() === "" ? 0n : BigInt(Math.floor(Date.now() / 1000) + Number(deadlineDays) * 86400);

    try {
      if (needsApproval) {
        setStep("approving");
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [escrowAddress, MAX_UINT256],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
        // Chain straight into creating the mandate instead of making the
        // user click a second time -- the earlier version stopped here and
        // relied on the allowance read to refresh on its own before the
        // next click, which it doesn't do automatically, so the button
        // stayed stuck offering to "approve" again even though approval had
        // already gone through. refetch() gives back the fresh value
        // directly rather than waiting on a render to pick up new state.
        await refetchAllowance();
      }

      setStep("creating");
      const createHash = await writeContractAsync({
        address: escrowAddress,
        abi: mandateEscrowAbi,
        functionName: "createMandate",
        args: [fulfillerAddress, amountAtomic, deadlineSeconds],
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: createHash });

      let mandateId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: mandateEscrowAbi, eventName: "MandateCreated", topics: log.topics, data: log.data });
          if (address && decoded.args.funder.toLowerCase() === address.toLowerCase()) {
            mandateId = decoded.args.mandateId;
            break;
          }
        } catch {
          // Not a MandateCreated log (e.g. the USDC Transfer log in the same receipt) -- skip.
        }
      }
      setState({
        success: mandateId !== null ? `Mandate #${mandateId} created and funded.` : "Mandate created and funded.",
        txHash: createHash,
      });
      setFulfiller("");
      setAmount("");
      setDeadlineDays("");
      router.refresh();
    } catch (err) {
      setState({ error: shortErrorMessage(err) });
    } finally {
      setStep("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-xs font-medium text-muted">
        Fulfiller address <span className="text-muted">(blank = open, first proof wins)</span>
        <input
          value={fulfiller}
          onChange={(e) => setFulfiller(e.target.value)}
          placeholder="0x… or leave blank"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-accent"
        />
      </label>
      <label className="text-xs font-medium text-muted">
        Amount (USDC)
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          step="0.000001"
          min="0"
          required
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-accent"
        />
      </label>
      <label className="text-xs font-medium text-muted">
        Deadline in days <span className="text-muted">(blank = none, no refund path)</span>
        <input
          value={deadlineDays}
          onChange={(e) => setDeadlineDays(e.target.value)}
          type="number"
          min="1"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-accent"
        />
      </label>
      <TxResult state={state} />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
      >
        {busy
          ? step === "approving"
            ? "Approving USDC…"
            : "Creating mandate…"
          : needsApproval
            ? "Approve USDC, then create"
            : "Create & fund mandate"}
      </button>
    </form>
  );
}

function ManageMandateForm() {
  const { address } = useAccount();
  const router = useRouter();
  const [mandateIdInput, setMandateIdInput] = useState("");
  const [loadedId, setLoadedId] = useState<bigint | null>(null);
  const [proofText, setProofText] = useState("");
  const [state, setState] = useState<TxState>({});
  const [busy, setBusy] = useState(false);
  // Read once per mount rather than inline at render time -- Date.now() is
  // an impure call and React's rules disallow calling it directly in a
  // component body, but a lazy useState initializer runs exactly once and
  // is the documented exception.
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  // See the comment on the equivalent line in CreateMandateForm above.
  const escrowAddress = MANDATE_ESCROW_ADDRESS;

  const { data: mandate, refetch } = useReadContract({
    address: escrowAddress,
    abi: mandateEscrowAbi,
    functionName: "mandates",
    args: loadedId !== null ? [loadedId] : undefined,
    query: { enabled: loadedId !== null && !!escrowAddress },
  });

  const { writeContractAsync } = useWriteContract();

  if (!escrowAddress) return null;

  function loadMandate(e: React.FormEvent) {
    e.preventDefault();
    setState({});
    const id = mandateIdInput.trim();
    if (!/^\d+$/.test(id)) {
      setState({ error: "Mandate # must be a whole number." });
      setLoadedId(null);
      return;
    }
    setLoadedId(BigInt(id));
  }

  async function run(fn: () => Promise<`0x${string}`>) {
    setState({});
    setBusy(true);
    try {
      const hash = await fn();
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setState({ success: "Confirmed on-chain.", txHash: hash });
      refetch();
      router.refresh();
    } catch (err) {
      setState({ error: shortErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const [funder, fulfiller, amount, deadline, , status] = mandate ?? [];
  const statusName = status !== undefined ? STATUS_NAMES[status] : undefined;
  const isFunder = !!address && !!funder && address.toLowerCase() === funder.toLowerCase();
  const isFulfiller = !!address && !!fulfiller && address.toLowerCase() === fulfiller.toLowerCase();
  const isOpenUnclaimed = fulfiller === ZERO_ADDRESS;
  const pastDeadline = !!deadline && deadline > 0n && BigInt(nowSeconds) >= deadline;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={loadMandate} className="flex items-end gap-2">
        <label className="flex-1 text-xs font-medium text-muted">
          Mandate #
          <input
            value={mandateIdInput}
            onChange={(e) => setMandateIdInput(e.target.value)}
            placeholder="0"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </label>
        <button type="submit" className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-background">
          Load
        </button>
      </form>

      {loadedId !== null && mandate && statusName === "None" && (
        <p className="text-xs text-warning">No mandate #{loadedId.toString()} exists yet.</p>
      )}

      {loadedId !== null && mandate && statusName && statusName !== "None" && (
        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          <p className="font-mono">
            funder {funder?.slice(0, 6)}…{funder?.slice(-4)} · fulfiller{" "}
            {isOpenUnclaimed ? "open" : `${fulfiller?.slice(0, 6)}…${fulfiller?.slice(-4)}`} · $
            {amount !== undefined ? formatUnits(amount, USDC_DECIMALS) : "?"} · {statusName}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {statusName === "Funded" && (isOpenUnclaimed || isFulfiller) && (
              <div className="flex items-end gap-2">
                <label className="flex-1 text-xs font-medium text-muted">
                  Proof (any text · hashed client-side)
                  <input
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    placeholder="e.g. a URL, a description, an IPFS CID"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !proofText.trim()}
                  onClick={() =>
                    run(() =>
                      writeContractAsync({
                        address: escrowAddress,
                        abi: mandateEscrowAbi,
                        functionName: "submitProof",
                        args: [loadedId!, keccak256(stringToHex(proofText.trim()))],
                      })
                    )
                  }
                  className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  Submit proof
                </button>
              </div>
            )}

            {(statusName === "Funded" || statusName === "Fulfilled") && isFunder && amount !== undefined && fulfiller && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    writeContractAsync({
                      address: escrowAddress,
                      abi: mandateEscrowAbi,
                      functionName: "release",
                      args: [loadedId!, [isOpenUnclaimed ? address! : fulfiller], [amount]],
                    })
                  )
                }
                className="w-fit rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                Release full amount to fulfiller
              </button>
            )}

            {statusName === "Funded" && pastDeadline && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    writeContractAsync({
                      address: escrowAddress,
                      abi: mandateEscrowAbi,
                      functionName: "refund",
                      args: [loadedId!],
                    })
                  )
                }
                className="w-fit rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-background disabled:opacity-50"
              >
                Refund (deadline passed)
              </button>
            )}

            {statusName === "Funded" && !isFunder && !isFulfiller && !isOpenUnclaimed && (
              <p className="text-muted">Assigned to a different fulfiller. Nothing to do here with this wallet.</p>
            )}
            {(statusName === "Released" || statusName === "Refunded") && (
              <p className="text-muted">Final state · nothing left to do.</p>
            )}
          </div>
        </div>
      )}

      <TxResult state={state} />
    </div>
  );
}

export function WalletMandatePanel() {
  return (
    <section className="flex flex-col gap-3 rounded-xl border-2 border-accent bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">Use MandateEscrow yourself</h2>
        <p className="text-xs text-muted">
          This doesn&apos;t touch Arcurrent&apos;s treasury. Connect your own wallet and fund a mandate with
          your own USDC on Arc mainnet · the same open, permissionless contract Arcurrent&apos;s own agent
          uses below, available to anyone.
        </p>
      </div>
      <ConnectGate>
        <div className="flex flex-col gap-4">
          <AccountBar />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Create a mandate</h3>
              <CreateMandateForm />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Manage a mandate</h3>
              <ManageMandateForm />
            </div>
          </div>
        </div>
      </ConnectGate>
    </section>
  );
}
