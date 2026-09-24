import type { Hex } from "viem";
import type { MandateStatus } from "./constants.js";

export interface Mandate {
  id: bigint;
  funder: `0x${string}`;
  /** address(0) until an open mandate's first proof submission; check `isOpen`. */
  fulfiller: `0x${string}`;
  /** True while no fulfiller has been assigned (an open mandate nobody has claimed). */
  isOpen: boolean;
  /** Locked amount in USDC base units (6 decimals). */
  amount: bigint;
  /** Same amount as a decimal string, e.g. "0.06". */
  amountUsdc: string;
  /** Unix seconds after which the funder may refund, or null for no deadline (no refund path). */
  deadline: number | null;
  /** null until a proof has been submitted. */
  proofHash: Hex | null;
  status: Exclude<MandateStatus, "None">;
}

export interface Reputation {
  completed: number;
  refunded: number;
  /** Total USDC volume of released mandates credited to this address, base units. */
  volumeSettled: bigint;
  volumeSettledUsdc: string;
}

export interface TxResult {
  hash: Hex;
  explorerUrl: string;
}

export interface CreateMandateParams {
  /** Decimal USDC, e.g. "25" or "0.5". At most 6 decimals. */
  amountUsdc: string;
  /** Who may post proof. Omit for an open mandate: whoever posts proof first becomes the fulfiller. */
  fulfiller?: `0x${string}`;
  /** Refund deadline. Omit for none (then the funder has no refund path). */
  deadline?: { days: number } | { unix: number };
}

export interface CreateMandateResult extends TxResult {
  mandateId: bigint;
  /** Present only if an allowance top-up was needed first. */
  approval: TxResult | null;
}

export type ProofInput = { text: string } | { hash: Hex };
