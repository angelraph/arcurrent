import {
  initiateDeveloperControlledWalletsClient,
  type CircleDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";
import { createPublicKey, createVerify, type KeyObject } from "node:crypto";
import { ARC_TESTNET } from "./chain.js";

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

/** Executes a real USDC transfer on Arc Testnet from the treasury wallet. */
export async function settleObligationOnChain(params: {
  walletId: string;
  destinationAddress: string;
  amountUsdc: number;
  refId?: string;
}): Promise<{ transactionId: string }> {
  const circle = getCircleClient();
  const res = await circle.createTransaction({
    walletId: params.walletId,
    // tokenId, not tokenAddress: Circle's transfer endpoint requires tokenId
    // OR blockchain to be set, and the SDK's types forbid passing blockchain
    // alongside walletId — confirmed against the live API (see chain.ts).
    tokenId: ARC_TESTNET.usdcTokenId,
    amount: [params.amountUsdc.toString()],
    destinationAddress: params.destinationAddress,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    refId: params.refId,
  });
  const transactionId = res.data?.id;
  if (!transactionId) {
    throw new Error("Circle createTransaction response did not include a transaction id");
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
