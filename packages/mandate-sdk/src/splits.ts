import { isAddress } from "viem";
import { ZERO_ADDRESS } from "./constants.js";
import { MandateError } from "./errors.js";
import { parseUsdc } from "./usdc.js";

export interface Split {
  to: `0x${string}`;
  /** Decimal USDC, e.g. "0.04". */
  amountUsdc: string;
}

export interface ResolvedSplits {
  destinations: `0x${string}`[];
  amounts: bigint[];
}

/**
 * Validates a release split against the mandate's locked amount. The
 * contract requires the parts to sum to exactly the locked amount; checking
 * here turns that into a readable error before any gas is spent.
 */
export function resolveSplits(splits: Split[], lockedAmount: bigint, decimals = 6): ResolvedSplits {
  if (splits.length === 0) {
    throw new MandateError("INVALID_SPLITS", "A release needs at least one destination.");
  }
  const destinations: `0x${string}`[] = [];
  const amounts: bigint[] = [];
  let total = 0n;

  for (const split of splits) {
    if (!isAddress(split.to) || split.to.toLowerCase() === ZERO_ADDRESS) {
      throw new MandateError("INVALID_ADDRESS", `"${split.to}" is not a valid non-zero destination address.`);
    }
    const amount = parseUsdc(split.amountUsdc, decimals);
    if (amount <= 0n) {
      throw new MandateError("INVALID_SPLITS", "Every split amount must be greater than zero.");
    }
    destinations.push(split.to);
    amounts.push(amount);
    total += amount;
  }

  if (total !== lockedAmount) {
    throw new MandateError(
      "INVALID_SPLITS",
      `Splits sum to ${total} base units but the mandate locks ${lockedAmount}; they must match exactly.`
    );
  }
  return { destinations, amounts };
}
