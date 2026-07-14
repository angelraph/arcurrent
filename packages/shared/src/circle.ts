import {
  initiateDeveloperControlledWalletsClient,
  type CircleDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";
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
    tokenAddress: ARC_TESTNET.usdcErc20Address,
    // No `blockchain` field here: when `walletId` is provided the chain is
    // implied by the wallet itself (created against ARC-TESTNET already) —
    // the SDK's types forbid passing both.
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
