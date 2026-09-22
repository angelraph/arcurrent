import { decodeEventLog, parseAbi, type Log } from "viem";
import { arcPublicClient, getCircleClient } from "./circle.js";
import { getActiveArcNetwork } from "./chain.js";

/**
 * MandateEscrow.sol's read surface, plus events. Every mutation
 * (createMandate, submitProof, release, refund) is signed directly by
 * whichever address is acting as funder or fulfiller — Mandate has no
 * owner, unlike ObligationEscrow. The one write function below
 * (settleObligationViaMandate) is the treasury agent acting as an ordinary
 * funder, not a privileged caller: it goes through the exact same
 * createMandate -> release path any other address would.
 */
const mandateEscrowAbi = parseAbi([
  "function nextMandateId() view returns (uint256)",
  "function mandates(uint256) view returns (address funder, address fulfiller, uint256 amount, uint256 deadline, bytes32 proofHash, uint8 status)",
  "function reputationOf(address) view returns (uint64 completed, uint64 refunded, uint256 volumeSettled)",
  "event MandateCreated(uint256 indexed mandateId, address indexed funder, address indexed fulfiller, uint256 amount, uint256 deadline)",
]);

const erc20AllowanceAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
]);

/** type(uint256).max — approved once so the agent never pays for an approve() transaction per obligation. */
const MAX_UINT256 = (2n ** 256n - 1n).toString();

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

  return rows
    .map(([funder, fulfiller, amount, deadline, proofHash, status], id) => ({
      id,
      funder,
      fulfiller,
      amountUsdc: Number(amount) / 10 ** network.usdcErc20Decimals,
      deadline: deadline === 0n ? null : Number(deadline),
      proofHash,
      status: MANDATE_STATUS_NAMES[status] ?? "None",
    }))
    .reverse();
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

/**
 * Settles an obligation by creating and immediately releasing a mandate —
 * the general-primitive replacement for ObligationEscrow.settle(). No
 * proof-submission step: an obligation payment is the agent's own
 * due-date/balance decision, not a third party's deliverable, so the
 * funder (the agent) releases straight from Funded. Two on-chain calls
 * instead of ObligationEscrow's one (createMandate, then release), because
 * unlike ObligationEscrow's pre-funded pool, MandateEscrow pulls USDC
 * directly from the caller's own balance per mandate — the tradeoff for
 * every obligation becoming its own auditable, reputation-updating record
 * instead of a line in a private pool's ledger.
 *
 * NOT exercised against a live network yet (no funded mainnet wallet in
 * this environment) — same "verify before relying on it" caveat as the
 * webhook route and the mainnet RPC values in chain.ts. In particular, the
 * array-typed `release` parameters passed through Circle's
 * createContractExecutionTransaction haven't been confirmed against a real
 * Circle response; everything else here mirrors settleObligationOnChain's
 * already-proven shape.
 */
export async function settleObligationViaMandate(params: {
  walletId: string;
  /** The treasury wallet's own address — needed to check its current allowance and to identify its MandateCreated log. */
  ownerAddress: `0x${string}`;
  mandateEscrowAddress: string;
  obligationId: string;
  destinationAddress: string;
  amountUsdc: number;
}): Promise<{ transactionId: string; mandateId: string }> {
  const circle = getCircleClient();
  const network = getActiveArcNetwork();
  const amountAtomic = BigInt(Math.round(params.amountUsdc * 10 ** network.usdcErc20Decimals));

  const currentAllowance = await arcPublicClient.readContract({
    address: network.usdcErc20Address,
    abi: erc20AllowanceAbi,
    functionName: "allowance",
    args: [params.ownerAddress, params.mandateEscrowAddress as `0x${string}`],
  });

  if (currentAllowance < amountAtomic) {
    const approveRes = await circle.createContractExecutionTransaction({
      walletId: params.walletId,
      contractAddress: network.usdcErc20Address,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [params.mandateEscrowAddress, MAX_UINT256],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const approveTransactionId = approveRes.data?.id;
    if (!approveTransactionId) {
      throw new Error("Circle createContractExecutionTransaction (approve) response did not include a transaction id");
    }
    await circle.getTransaction({
      id: approveTransactionId,
      waitForState: "CONFIRMED",
      signal: AbortSignal.timeout(30_000),
    });
  }

  const createRes = await circle.createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.mandateEscrowAddress,
    abiFunctionSignature: "createMandate(address,uint256,uint256)",
    abiParameters: [params.destinationAddress, amountAtomic.toString(), "0"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    // No refId here — this transaction confirming only means the mandate is
    // funded, not that the obligation is paid. Only release()'s transaction
    // below carries refId, so the webhook (which marks the obligation
    // "settled" when refId's transaction confirms) can't fire early.
  });
  const createTransactionId = createRes.data?.id;
  if (!createTransactionId) {
    throw new Error("Circle createContractExecutionTransaction (createMandate) response did not include a transaction id");
  }
  const createTx = await circle.getTransaction({
    id: createTransactionId,
    waitForState: "CONFIRMED",
    signal: AbortSignal.timeout(30_000),
  });
  // getTransaction()'s response nests fields under `.data.transaction`
  // (TransactionResponseData), unlike createContractExecutionTransaction's
  // flatter `.data.id` above — easy to miss since depositToEscrow/
  // settleObligationOnChain never read a field off a getTransaction() result
  // before this, only awaited it for its confirmed state.
  const createTxHash = createTx.data?.transaction?.txHash;
  if (!createTxHash) {
    throw new Error("Confirmed createMandate transaction has no on-chain txHash yet");
  }

  const receipt = await arcPublicClient.getTransactionReceipt({ hash: createTxHash as `0x${string}` });
  const mandateId = findMandateIdFromCreatedLogs(receipt.logs, params.ownerAddress);
  if (mandateId === null) {
    throw new Error(`No MandateCreated event for ${params.ownerAddress} found in createMandate receipt ${createTxHash}`);
  }

  const releaseRes = await circle.createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.mandateEscrowAddress,
    abiFunctionSignature: "release(uint256,address[],uint256[])",
    abiParameters: [mandateId.toString(), [params.destinationAddress], [amountAtomic.toString()]],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    refId: params.obligationId,
  });
  const releaseTransactionId = releaseRes.data?.id;
  if (!releaseTransactionId) {
    throw new Error("Circle createContractExecutionTransaction (release) response did not include a transaction id");
  }

  return { transactionId: releaseTransactionId, mandateId: mandateId.toString() };
}
