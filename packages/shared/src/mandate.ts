import { decodeEventLog, parseAbi, type Log } from "viem";
import { arcPublicClient } from "./circle.js";
import { getActiveArcNetwork } from "./chain.js";

/**
 * MandateEscrow.sol's read surface, plus events. Every mutation
 * (createMandate, submitProof, release, refund) is signed directly by
 * whichever address is acting as funder or fulfiller — Mandate has no
 * owner, unlike ObligationEscrow. The treasury agent's own payments go
 * through its AgentVault (see vault.ts), which is an ordinary funder of
 * mandates like any other address.
 */
const mandateEscrowAbi = parseAbi([
  "function nextMandateId() view returns (uint256)",
  "function mandates(uint256) view returns (address funder, address fulfiller, uint256 amount, uint256 deadline, bytes32 proofHash, uint8 status)",
  "function reputationOf(address) view returns (uint64 completed, uint64 refunded, uint256 volumeSettled)",
  "event MandateCreated(uint256 indexed mandateId, address indexed funder, address indexed fulfiller, uint256 amount, uint256 deadline)",
]);

const MANDATE_STATUS_NAMES = ["None", "Funded", "Fulfilled", "Released", "Refunded"] as const;
export type MandateStatusName = (typeof MANDATE_STATUS_NAMES)[number];

export interface Mandate {
  id: number;
  funder: `0x${string}`;
  fulfiller: `0x${string}`;
  amountUsdc: number;
  /** Unix seconds, or null if the mandate has no deadline (no refund path). */
  deadline: number | null;
  proofHash: `0x${string}`;
  status: MandateStatusName;
}

export interface MandateReputation {
  completed: number;
  refunded: number;
  volumeSettledUsdc: number;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type MandateRow = readonly [`0x${string}`, `0x${string}`, bigint, bigint, `0x${string}`, number];

/** Pure row-to-Mandate mapping shared by the list and single-mandate readers; exported for tests. */
export function toMandate(id: number, row: MandateRow, usdcDecimals: number): Mandate {
  const [funder, fulfiller, amount, deadline, proofHash, status] = row;
  return {
    id,
    funder,
    fulfiller,
    amountUsdc: Number(amount) / 10 ** usdcDecimals,
    deadline: deadline === 0n ? null : Number(deadline),
    proofHash,
    status: MANDATE_STATUS_NAMES[status] ?? "None",
  };
}

/** One mandate by id, or null if that id was never created (the contract returns an all-zero row, status None). */
export async function getMandate(escrowAddress: `0x${string}`, id: number): Promise<Mandate | null> {
  const network = getActiveArcNetwork();
  const row = await arcPublicClient.readContract({
    address: escrowAddress,
    abi: mandateEscrowAbi,
    functionName: "mandates",
    args: [BigInt(id)],
  });
  const mandate = toMandate(id, row, network.usdcErc20Decimals);
  return mandate.status === "None" ? null : mandate;
}

/**
 * Reads every mandate directly (nextMandateId(), then one `mandates(id)`
 * read per id) rather than scanning event logs for MandateCreated. That
 * sidesteps the ~10,000-block eth_getLogs span cap noted in chain.ts
 * entirely — at this project's demo scale, N individual reads is simpler
 * and just as correct as indexing events would be. Newest first.
 */
export async function getMandates(escrowAddress: `0x${string}`): Promise<Mandate[]> {
  const network = getActiveArcNetwork();
  const count = await arcPublicClient.readContract({
    address: escrowAddress,
    abi: mandateEscrowAbi,
    functionName: "nextMandateId",
  });

  const ids = Array.from({ length: Number(count) }, (_, i) => i);
  const rows = await Promise.all(
    ids.map((id) =>
      arcPublicClient.readContract({
        address: escrowAddress,
        abi: mandateEscrowAbi,
        functionName: "mandates",
        args: [BigInt(id)],
      })
    )
  );

  return rows.map((row, id) => toMandate(id, row, network.usdcErc20Decimals)).reverse();
}

/** Null fulfiller (never assigned, e.g. an open mandate nobody has touched yet) has no reputation to read. */
export async function getMandateReputation(
  escrowAddress: `0x${string}`,
  address: `0x${string}`
): Promise<MandateReputation | null> {
  if (address.toLowerCase() === ZERO_ADDRESS) return null;

  const network = getActiveArcNetwork();
  const [completed, refunded, volumeSettled] = await arcPublicClient.readContract({
    address: escrowAddress,
    abi: mandateEscrowAbi,
    functionName: "reputationOf",
    args: [address],
  });

  return {
    completed: Number(completed),
    refunded: Number(refunded),
    volumeSettledUsdc: Number(volumeSettled) / 10 ** network.usdcErc20Decimals,
  };
}

/**
 * Picks this funder's own MandateCreated event out of a transaction
 * receipt's logs. Reading nextMandateId() right after the createMandate
 * call would be simpler, but MandateEscrow is genuinely permissionless —
 * another address's createMandate could land between ours confirming and
 * that read, which would silently hand back someone else's mandate id.
 * Matching on the funder in the decoded event itself is race-proof; pure
 * function so it's testable without a live chain (see mandate.test.ts).
 */
export function findMandateIdFromCreatedLogs(logs: Log[], funder: `0x${string}`): bigint | null {
  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: mandateEscrowAbi,
        eventName: "MandateCreated",
        topics: log.topics,
        data: log.data,
      });
    } catch {
      continue; // Not a MandateCreated log (e.g. the USDC Transfer log in the same receipt).
    }
    if (decoded.args.funder.toLowerCase() === funder.toLowerCase()) {
      return decoded.args.mandateId;
    }
  }
  return null;
}
