import { MandateClient, ARC_MAINNET, parseUsdc } from "@arcurrent/mandate-sdk";
import type { MandateServerConfig } from "./server.js";

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export const DEFAULT_MAX_MANDATE_USDC = "5";
export const DEFAULT_SESSION_BUDGET_USDC = "20";

export interface ConfigResult {
  config: MandateServerConfig;
  /** Human-readable notes for stderr (never includes the key). */
  notices: string[];
}

/**
 * Builds the server config from environment variables, failing loudly on
 * anything malformed instead of quietly running with a weaker setup than the
 * operator asked for.
 *
 *   MANDATE_RPC_URL              optional, defaults to Arc's public mainnet RPC
 *   MANDATE_ESCROW_ADDRESS       optional, defaults to the deployed MandateEscrow
 *   MANDATE_PRIVATE_KEY          optional, a dedicated low-balance wallet; enables signing
 *   MANDATE_ENABLE_WRITES        "true" to expose the tools that move funds (needs the key)
 *   MANDATE_MAX_USDC             per-mandate cap, default 5
 *   MANDATE_SESSION_BUDGET_USDC  total this process may lock, default 20
 */
export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const notices: string[] = [];
  const escrowAddress = env.MANDATE_ESCROW_ADDRESS?.trim();
  if (escrowAddress && !ADDRESS_PATTERN.test(escrowAddress)) {
    throw new Error("MANDATE_ESCROW_ADDRESS is not a valid 0x address.");
  }
  const maxUsdc = env.MANDATE_MAX_USDC?.trim() || DEFAULT_MAX_MANDATE_USDC;
  const sessionBudgetUsdc = env.MANDATE_SESSION_BUDGET_USDC?.trim() || DEFAULT_SESSION_BUDGET_USDC;
  // parseUsdc throws a clear MandateError on anything that is not a plain decimal.
  parseUsdc(maxUsdc);
  parseUsdc(sessionBudgetUsdc);

  const writesRequested = env.MANDATE_ENABLE_WRITES?.trim().toLowerCase() === "true";
  const privateKey = env.MANDATE_PRIVATE_KEY?.trim();
  if (privateKey && !PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new Error("MANDATE_PRIVATE_KEY must be a 0x-prefixed 32-byte hex private key.");
  }
  if (writesRequested && !privateKey) {
    throw new Error("MANDATE_ENABLE_WRITES=true needs MANDATE_PRIVATE_KEY (use a dedicated, low-balance wallet).");
  }

  const options = {
    rpcUrl: env.MANDATE_RPC_URL?.trim() || ARC_MAINNET.rpcUrl,
    escrowAddress: escrowAddress as `0x${string}` | undefined,
    maxAmountUsdc: maxUsdc,
  };

  let client: MandateClient;
  if (privateKey && writesRequested) {
    client = MandateClient.fromPrivateKey(privateKey as `0x${string}`, options);
    notices.push(`Write tools ENABLED from wallet ${client.address}. Per-mandate cap ${maxUsdc} USDC, session budget ${sessionBudgetUsdc} USDC.`);
  } else {
    // A key without MANDATE_ENABLE_WRITES stays unused: read-only unless explicitly opted in.
    client = new MandateClient(options);
    notices.push(
      privateKey
        ? "MANDATE_PRIVATE_KEY is set but MANDATE_ENABLE_WRITES is not \"true\", so the key is ignored and this server is read-only."
        : "Read-only mode (no wallet configured)."
    );
  }

  return { config: { client, writesEnabled: Boolean(privateKey && writesRequested), sessionBudgetUsdc }, notices };
}
