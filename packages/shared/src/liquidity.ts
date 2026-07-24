import { createCircleWalletsAdapter, type CircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { AppKit, BridgeChain, type BridgeResult } from "@circle-fin/app-kit";
import { depositToEscrow } from "./circle.js";

let adapter: CircleWalletsAdapter | null = null;

/**
 * Lazily-initialized singleton — same Circle credentials as getCircleClient(),
 * but wrapped as an AppKit/Bridge Kit adapter so kit.bridge() can sign
 * transactions through Circle's Developer-Controlled Wallets API instead of a
 * local private key (the treasury and liquidity wallets are both custodied by
 * Circle; this app never holds their keys).
 */
function getCircleWalletsAdapter(): CircleWalletsAdapter {
  if (adapter) return adapter;

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set.");
  }

  adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  return adapter;
}

export interface LiquidityTopUpResult {
  bridge: BridgeResult;
  approveTransactionId: string;
  depositTransactionId: string;
}

const BRIDGE_TIMEOUT_MS = 90_000;

/**
 * kit.bridge() has no built-in timeout — observed hanging indefinitely
 * (3+ hours, no error) when the source wallet had USDC but no native gas to
 * submit the burn transaction. A cron invocation would get killed by
 * Vercel's maxDuration first, but apps/agent's standalone run has nothing to
 * stop it, so wrap it ourselves: better a clear timeout error than a silent
 * hang on a financial operation.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Moves `amountUsdc` from a Circle-custodied liquidity wallet on another
 * CCTP-supported testnet chain into the Arc treasury wallet via
 * Circle's Cross-Chain Transfer Protocol (kit.bridge(), @circle-fin/app-kit),
 * then deposits the bridged funds into ObligationEscrow so the agent can
 * settle from it. Called when decide() returns `request_liquidity` — paying
 * the obligation itself is left to the next evaluation pass, since CCTP
 * attestation can take longer than a single cron invocation should block on.
 */
export async function topUpEscrowLiquidity(params: {
  amountUsdc: number;
  sourceChain: BridgeChain;
  sourceAddress: string;
  treasuryWalletId: string;
  treasuryAddress: string;
  escrowAddress: string;
}): Promise<LiquidityTopUpResult> {
  const walletsAdapter = getCircleWalletsAdapter();
  const kit = new AppKit();

  const bridge = await withTimeout(
    kit.bridge({
      from: { adapter: walletsAdapter, chain: params.sourceChain, address: params.sourceAddress },
      to: { adapter: walletsAdapter, chain: BridgeChain.Arc_Testnet, address: params.treasuryAddress },
      amount: params.amountUsdc.toFixed(2),
      token: "USDC",
    }),
    BRIDGE_TIMEOUT_MS,
    "kit.bridge()"
  );

  if (bridge.state !== "success") {
    throw new Error(
      `Bridge did not complete (state: ${bridge.state}); not depositing into escrow. Steps: ` +
        JSON.stringify(bridge.steps)
    );
  }

  const { approveTransactionId, depositTransactionId } = await depositToEscrow({
    walletId: params.treasuryWalletId,
    escrowAddress: params.escrowAddress,
    amountUsdc: params.amountUsdc,
  });

  return { bridge, approveTransactionId, depositTransactionId };
}
