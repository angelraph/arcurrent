import { MandateClient, VaultClient, ARC_MAINNET, ARC_TESTNET, arcMainnetChain, arcTestnetChain, parseUsdc } from "@arcurrent/mandate-sdk";
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
 *   MANDATE_NETWORK              "mainnet" (default) or "testnet"; testnet needs MANDATE_ESCROW_ADDRESS
 *   MANDATE_RPC_URL              optional, defaults to that network's public RPC
 *   MANDATE_ESCROW_ADDRESS       optional, defaults to the deployed MandateEscrow
 *   MANDATE_VAULT_ADDRESS        optional; route all payments through this AgentVault, whose
 *                                on-chain rules bound what the key can send. Then MANDATE_PRIVATE_KEY
 *                                should be the vault's operator wallet, which holds only gas.
 *   MANDATE_PRIVATE_KEY          optional, a dedicated low-balance wallet; enables signing
 *   MANDATE_ENABLE_WRITES        "true" to expose the tools that move funds (needs the key)
 *   MANDATE_MAX_USDC             per-mandate cap, default 5
 *   MANDATE_SESSION_BUDGET_USDC  total this process may lock, default 20
 */
export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const notices: string[] = [];
  const networkName = (env.MANDATE_NETWORK?.trim().toLowerCase() || "mainnet");
  if (networkName !== "mainnet" && networkName !== "testnet") {
    throw new Error('MANDATE_NETWORK must be "mainnet" or "testnet".');
  }
  const testnet = networkName === "testnet";
  const chain = testnet ? arcTestnetChain : arcMainnetChain;
  const escrowAddress = env.MANDATE_ESCROW_ADDRESS?.trim();
  if (escrowAddress && !ADDRESS_PATTERN.test(escrowAddress)) {
    throw new Error("MANDATE_ESCROW_ADDRESS is not a valid 0x address.");
  }
  if (testnet && !escrowAddress) {
    throw new Error("MANDATE_ESCROW_ADDRESS is required on testnet (the mainnet contract does not exist there).");
  }
  const vaultAddress = env.MANDATE_VAULT_ADDRESS?.trim();
  if (vaultAddress && !ADDRESS_PATTERN.test(vaultAddress)) {
    throw new Error("MANDATE_VAULT_ADDRESS is not a valid 0x address.");
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
    chain,
    rpcUrl: env.MANDATE_RPC_URL?.trim() || (testnet ? ARC_TESTNET.rpcUrl : ARC_MAINNET.rpcUrl),
    escrowAddress: escrowAddress as `0x${string}` | undefined,
    maxAmountUsdc: maxUsdc,
  };

  let client: MandateClient;
  let vault: VaultClient | undefined;
  if (privateKey && writesRequested) {
    client = MandateClient.fromPrivateKey(privateKey as `0x${string}`, options);
    if (vaultAddress) {
      vault = VaultClient.fromPrivateKey(privateKey as `0x${string}`, {
        vaultAddress: vaultAddress as `0x${string}`,
        chain,
        rpcUrl: options.rpcUrl,
      });
      notices.push(
        `Vault mode: payments go through ${vaultAddress} as operator ${client.address}, bounded by the vault's on-chain rules. Session budget ${sessionBudgetUsdc} USDC. Create, release and refund are not exposed.`
      );
    } else {
      notices.push(`Write tools ENABLED from wallet ${client.address}. Per-mandate cap ${maxUsdc} USDC, session budget ${sessionBudgetUsdc} USDC.`);
    }
  } else {
    // A key without MANDATE_ENABLE_WRITES stays unused: read-only unless explicitly opted in.
    client = new MandateClient(options);
    if (vaultAddress) {
      vault = new VaultClient({ vaultAddress: vaultAddress as `0x${string}`, chain, rpcUrl: options.rpcUrl });
      notices.push(`Vault ${vaultAddress} attached read-only: it can be inspected and payments pre-checked, but not made.`);
    }
    notices.push(
      privateKey
        ? "MANDATE_PRIVATE_KEY is set but MANDATE_ENABLE_WRITES is not \"true\", so the key is ignored and this server is read-only."
        : "Read-only mode (no wallet configured)."
    );
  }

  return { config: { client, writesEnabled: Boolean(privateKey && writesRequested), sessionBudgetUsdc, vault }, notices };
}
