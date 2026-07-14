import {
  initiateDeveloperControlledWalletsClient,
  type CircleDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";
import { createPublicKey, createVerify, type KeyObject } from "node:crypto";
import { createPublicClient, http, parseAbi } from "viem";
import { ARC_TESTNET } from "./chain.js";

const arcPublicClient = createPublicClient({ transport: http(ARC_TESTNET.rpcUrls.default) });
const erc20BalanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

let client: CircleDeveloperControlledWalletsClient | null = null;

/** Lazily-initialized singleton — throws if Circle credentials aren't configured. */
export function getCircleClient(): CircleDeveloperControlledWalletsClient {
  if (client) return client;

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error(
      "CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set. Generate them at " +
        "console.circle.com/api-keys and developers.circle.com/wallets/dev-controlled/register-entity-secret."
    );
  }

  client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return client;
}

/** USDC balance (ERC-20 interface) for a treasury wallet, in whole USDC. */
export async function getTreasuryUsdcBalance(walletId: string): Promise<number> {
  const circle = getCircleClient();
  const res = await circle.getWalletTokenBalance({
    id: walletId,
    tokenAddresses: [ARC_TESTNET.usdcErc20Address],
  });
  const amount = res.data?.tokenBalances?.[0]?.amount;
  return amount ? Number(amount) : 0;
}

/**
 * USDC balance held by the ObligationEscrow contract — the actual spendable
 * settlement pool, separate from whatever the treasury wallet itself holds
 * (which may include USDC not yet deposited into the escrow). Plain on-chain
 * read via RPC; no Circle API call needed.
 */
export async function getEscrowUsdcBalance(escrowAddress: `0x${string}`): Promise<number> {
  const balance = await arcPublicClient.readContract({
    address: ARC_TESTNET.usdcErc20Address,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: [escrowAddress],
  });
  return Number(balance) / 10 ** ARC_TESTNET.usdcErc20Decimals;
}

/**
 * Settles an obligation by calling ObligationEscrow.settle(obligationId,
 * destination, amount) from the treasury wallet — a contract-execution
 * transaction, not a plain transfer, so the payout is an on-chain program
 * action (with its own event log) rather than a bare wallet-to-wallet move.
 * Reverts on-chain (surfaced as a FAILED Circle transaction) if the escrow's
 * balance can't cover the amount, or if the caller isn't the escrow's owner.
 */
export async function settleObligationOnChain(params: {
  walletId: string;
  escrowAddress: string;
  obligationId: string;
  destinationAddress: string;
  amountUsdc: number;
}): Promise<{ transactionId: string }> {
  const circle = getCircleClient();
  const amountAtomic = String(Math.round(params.amountUsdc * 10 ** ARC_TESTNET.usdcErc20Decimals));
  const res = await circle.createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.escrowAddress,
    abiFunctionSignature: "settle(string,address,uint256)",
    abiParameters: [params.obligationId, params.destinationAddress, amountAtomic],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const transactionId = res.data?.id;
  if (!transactionId) {
    throw new Error("Circle createContractExecutionTransaction response did not include a transaction id");
  }
  return { transactionId };
}

const notificationPublicKeyCache = new Map<string, KeyObject>();

/**
 * Fetches (and caches) the ECDSA public key used to sign a Circle webhook,
 * keyed by the `X-Circle-Key-Id` header value. Uses CIRCLE_API_KEY directly
 * (not the entity secret — this is a plain authenticated GET, not a
 * developer-controlled-wallets mutation).
 */
export async function fetchNotificationPublicKey(keyId: string): Promise<KeyObject> {
  const cached = notificationPublicKeyCache.get(keyId);
  if (cached) return cached;

  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY must be set to verify webhook signatures.");
  }

  const res = await fetch(`https://api.circle.com/v2/notifications/publicKey/${keyId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Circle notification public key (${res.status}): ${await res.text()}`
    );
  }
  const body = (await res.json()) as { data?: { publicKey?: string } };
  const publicKeyBase64 = body.data?.publicKey;
  if (!publicKeyBase64) {
    throw new Error("Circle publicKey response did not include a key.");
  }

  const publicKey = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
  notificationPublicKeyCache.set(keyId, publicKey);
  return publicKey;
}

/**
 * Verifies a Circle webhook's ECDSA-SHA256 signature. `rawBody` must be the
 * exact, unparsed request body string — parsing the JSON and re-serializing
 * it changes byte order and breaks the signature, per Circle's docs. Pure
 * function (no I/O) so it's testable without a live Circle connection; the
 * network fetch lives in fetchNotificationPublicKey above.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureBase64: string,
  publicKey: KeyObject
): boolean {
  const verifier = createVerify("SHA256");
  verifier.update(rawBody);
  verifier.end();
  return verifier.verify(publicKey, signatureBase64, "base64");
}
