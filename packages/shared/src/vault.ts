import { keccak256, stringToHex } from "viem";
import { VaultClient, parseUsdc, type VaultPayCheck, type VaultPolicy } from "@arcurrent/mandate-sdk";
import { arcPublicClient, getCircleClient } from "./circle.js";
import { getActiveArcNetwork } from "./chain.js";
import { findMandateIdFromCreatedLogs } from "./mandate.js";

/**
 * The treasury agent settles through an AgentVault, not straight from its own
 * wallet. The vault holds the USDC and enforces the owner's rules (per-payment
 * cap, daily cap, payee allowlist, pause); the agent's Circle wallet is only
 * the vault's operator and holds nothing but gas. So even if the Circle
 * credentials leaked, the most an attacker could do is spend inside those
 * rules, and could never withdraw.
 */

export function getVaultClient(vaultAddress: `0x${string}`): VaultClient {
  return new VaultClient({ vaultAddress, publicClient: arcPublicClient });
}

export async function getVaultPolicy(vaultAddress: `0x${string}`): Promise<VaultPolicy> {
  return getVaultClient(vaultAddress).getPolicy();
}

/** What the agent does about an obligation the vault's rules would refuse right now. */
export interface VaultGate {
  action: "wait" | "insufficient_funds";
  reasoning: string;
}

/**
 * Turns a refused pre-flight into a decision the dashboard already knows how
 * to show. Rules the owner controls (caps, allowlist, pause, the daily
 * allowance) become "wait": nothing is wrong, the agent is holding until the
 * owner acts or the allowance refills, and the obligation stays pending for
 * the next pass. A vault that simply lacks the funds is "insufficient_funds",
 * the same as a low treasury was before.
 */
export function gateFromCheck(check: VaultPayCheck): VaultGate | null {
  if (check.ok) return null;
  const action = check.code === "INSUFFICIENT_BALANCE" ? "insufficient_funds" : "wait";
  return { action, reasoning: `Held by the vault's rules: ${check.message}` };
}

/** Tag echoed in the vault's Paid event: a hash of the obligation id, so a payment is traceable to its obligation on-chain. */
export function refForObligation(obligationId: string): `0x${string}` {
  return keccak256(stringToHex(obligationId));
}

export interface VaultPayment {
  /** Circle's transaction id, which also carries refId = obligation id for the webhook. */
  transactionId: string;
  /** null if confirmation was not seen within the wait; it will still be settled by the webhook. */
  mandateId: string | null;
}

/**
 * Submits one `pay` call to the vault through the operator's Circle wallet.
 * The mandate is created and released inside that single transaction, so
 * there is no half-finished state to clean up.
 *
 * Throws only if the submission itself failed (nothing was sent, safe to
 * retry). Once Circle has accepted the transaction this never throws: a slow
 * confirmation must not look like a failure, because a retry would pay twice.
 * The webhook marks the obligation settled when the transaction confirms.
 */
export async function payViaVault(params: {
  walletId: string;
  vaultAddress: `0x${string}`;
  obligationId: string;
  destinationAddress: string;
  amountUsdc: number;
}): Promise<VaultPayment> {
  const circle = getCircleClient();
  const network = getActiveArcNetwork();
  const amountAtomic = parseUsdc(params.amountUsdc.toFixed(network.usdcErc20Decimals), network.usdcErc20Decimals);

  const res = await circle.createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.vaultAddress,
    abiFunctionSignature: "pay(address,uint256,bytes32)",
    abiParameters: [params.destinationAddress, amountAtomic.toString(), refForObligation(params.obligationId)],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    refId: params.obligationId,
  });
  const transactionId = res.data?.id;
  if (!transactionId) {
    throw new Error("Circle createContractExecutionTransaction (vault pay) response did not include a transaction id");
  }

  let mandateId: string | null = null;
  try {
    const confirmed = await circle.getTransaction({
      id: transactionId,
      waitForState: "CONFIRMED",
      signal: AbortSignal.timeout(30_000),
    });
    const txHash = confirmed.data?.transaction?.txHash;
    if (txHash) {
      const receipt = await arcPublicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      mandateId = findMandateIdFromCreatedLogs(receipt.logs, params.vaultAddress)?.toString() ?? null;
    }
  } catch {
    // Submitted but not yet confirmed (or the receipt isn't indexed yet). The webhook settles it.
  }
  return { transactionId, mandateId };
}
