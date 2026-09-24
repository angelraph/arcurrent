import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MandateClient, MandateError, VaultClient, erc20Abi, formatUsdc, parseUsdc, type Mandate } from "@arcurrent/mandate-sdk";
import { z } from "zod";

export interface MandateServerConfig {
  client: MandateClient;
  /** Register the tools that move funds. Off means the server is strictly read-only. */
  writesEnabled: boolean;
  /**
   * Total USDC this server process may lock across all create_mandate calls,
   * decimal string. A second rail on top of the per-mandate cap on the
   * client: an agent stuck in a loop can't drain the wallet one small
   * mandate at a time.
   */
  sessionBudgetUsdc: string;
  /**
   * Route all payments through this AgentVault. With a vault, the unrestricted
   * tools (create, release, refund) are not registered at all: the only way to
   * move funds is vault_pay, which the vault's on-chain rules bound.
   */
  vault?: VaultClient;
}

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 40-hex-character address");
const idSchema = z.number().int().min(0).describe("The mandate id (0, 1, 2, ...).");

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): ToolResult {
  if (err instanceof MandateError) {
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: err.code, message: err.message }, null, 2) }] };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "UNEXPECTED", message }, null, 2) }] };
}

function describeMandate(m: Mandate, wallet: `0x${string}` | undefined, writesEnabled: boolean) {
  const base = {
    id: m.id.toString(),
    status: m.status,
    amount_usdc: m.amountUsdc,
    funder: m.funder,
    fulfiller: m.isOpen ? null : m.fulfiller,
    open_to_any_fulfiller: m.isOpen,
    deadline: m.deadline === null ? null : new Date(m.deadline * 1000).toISOString(),
    proof_hash: m.proofHash,
    page: `https://arcurrent.site/mandate/${m.id}`,
  };
  if (!wallet || !writesEnabled) return base;

  const me = wallet.toLowerCase();
  const isFunder = m.funder.toLowerCase() === me;
  const isFulfiller = !m.isOpen && m.fulfiller.toLowerCase() === me;
  const actions: string[] = [];
  if (m.status === "Funded" && (isFulfiller || m.isOpen)) actions.push("submit_proof");
  if ((m.status === "Funded" || m.status === "Fulfilled") && isFunder) actions.push("release_mandate");
  if (m.status === "Funded" && isFunder && m.deadline !== null && Date.now() / 1000 >= m.deadline) actions.push("refund_mandate");
  return {
    ...base,
    this_wallet: { address: wallet, role: isFunder ? "funder" : isFulfiller ? "fulfiller" : m.isOpen ? "could claim (open)" : "none" },
    actions_available_to_this_wallet: actions,
  };
}

interface VaultToolContext {
  vault: VaultClient;
  writesEnabled: boolean;
  budget: bigint;
  config: MandateServerConfig;
  spent: () => bigint;
  addSpent: (amount: bigint) => void;
}

function registerVaultTools(server: McpServer, ctx: VaultToolContext) {
  const { vault, writesEnabled, budget, config } = ctx;

  server.registerTool(
    "get_vault",
    {
      title: "Get the vault's rules and balance",
      description: "Reads the AgentVault this server pays through: its USDC balance, the per-payment and daily caps, how much of the daily allowance is available right now, whether payees must be on an allowlist, whether it is paused, and who the owner, operator and guardian are.",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const p = await vault.getPolicy();
        return ok({
          vault: vault.vaultAddress,
          balance_usdc: p.balanceUsdc,
          per_payment_cap_usdc: p.perPaymentCapUsdc,
          daily_cap_usdc: p.dailyCapUsdc,
          available_now_usdc: p.availableUsdc,
          allowlist_required: p.allowlistRequired,
          paused: p.paused,
          owner: p.owner,
          operator: p.operator,
          guardian: p.guardian,
          this_wallet_is_operator: vault.address ? vault.address.toLowerCase() === p.operator.toLowerCase() : null,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "check_vault_payment",
    {
      title: "Check whether the vault would allow a payment",
      description: "Asks whether a payment would go through right now under the vault's rules, without sending anything or spending gas. If not, says why (over a cap, payee not on the allowlist, paused, daily allowance used up and when it refills, vault too empty). Always call this before vault_pay.",
      inputSchema: { to: addressSchema, amount_usdc: z.string().describe('Decimal USDC, e.g. "0.5".') },
      annotations: READ_ONLY,
    },
    async ({ to, amount_usdc }) => {
      try {
        const result = await vault.checkPay({ to, amountUsdc: amount_usdc }, vault.address);
        return ok(result.ok ? { ok: true } : { ok: false, reason: result.code, message: result.message });
      } catch (err) {
        return fail(err);
      }
    }
  );

  if (!writesEnabled) return;

  server.registerTool(
    "vault_pay",
    {
      title: "Pay from the vault",
      description: "Pays USDC from the vault to an address as one atomic MandateEscrow mandate (created and released in a single transaction). The vault enforces its owner's rules on-chain, so this cannot exceed the per-payment cap, the daily allowance, or pay a payee the allowlist does not include, and it cannot withdraw. It still moves real funds and cannot be undone: confirm the payee and amount with the user first.",
      inputSchema: {
        to: addressSchema,
        amount_usdc: z.string().describe('Decimal USDC, e.g. "0.5".'),
        ref: z.string().max(200).optional().describe("Optional note or id to tag the payment with (hashed into the on-chain event)."),
      },
      annotations: MOVES_FUNDS,
    },
    async ({ to, amount_usdc, ref }) => {
      try {
        const amount = parseUsdc(amount_usdc, vault.usdcDecimals);
        if (ctx.spent() + amount > budget) {
          throw new MandateError(
            "AMOUNT_OVER_CAP",
            `This would bring the session total to ${formatUsdc(ctx.spent() + amount, vault.usdcDecimals)} USDC, over the ${config.sessionBudgetUsdc} USDC session budget. Restart the server to reset it, or raise MANDATE_SESSION_BUDGET_USDC.`
          );
        }
        const result = await vault.pay({ to: to as `0x${string}`, amountUsdc: amount_usdc, ref });
        ctx.addSpent(amount);
        return ok({
          mandate_id: result.mandateId.toString(),
          amount_usdc,
          to,
          tx: result.hash,
          tx_url: result.explorerUrl,
          page: `https://arcurrent.site/mandate/${result.mandateId}`,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const MOVES_FUNDS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;

/**
 * MandateEscrow as MCP tools. Every value the tools return comes straight from
 * the contract (addresses, amounts, status, a proof hash), so there is no
 * free-text field a third party could use to smuggle instructions to the
 * agent; the only text that is hashed is what the agent itself supplies.
 */
export function createMandateServer(config: MandateServerConfig): McpServer {
  const { client, writesEnabled, vault } = config;
  const budget = parseUsdc(config.sessionBudgetUsdc, client.usdcDecimals);
  let lockedThisSession = 0n;

  const server = new McpServer(
    { name: "mandate-escrow", version: "0.1.0" },
    {
      instructions:
        "MandateEscrow is an open escrow and reputation contract on Arc mainnet (USDC). A funder locks USDC in a mandate for a fulfiller (or leaves it open), the fulfiller posts a hash of their proof, and the funder releases the funds, optionally split across several addresses in one transaction. Outcomes update an on-chain reputation ledger per address. " +
        (vault
          ? "Payments go through an AgentVault: an on-chain treasury whose owner-set rules (per-payment cap, daily cap, payee allowlist, pause) bound what this server can send, and which it can never withdraw from. " +
            (writesEnabled
              ? "Use check_vault_payment first, then vault_pay, and confirm the payee and amount with your user."
              : "This server is read-only: it can inspect the vault and check whether a payment would be allowed, but cannot pay.")
          : writesEnabled
            ? "This server can move real funds from its configured wallet: confirm amounts and destinations with your user before create_mandate or release_mandate, and prefer small amounts."
            : "This server is read-only: it can inspect mandates and reputation but cannot move funds."),
    }
  );

  server.registerTool(
    "get_config",
    {
      title: "Get MandateEscrow configuration",
      description: "Shows which network and contract this server talks to, whether it can move funds, the spend limits, and (if a wallet is configured) that wallet's address and USDC balance.",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const address = client.address;
        let balance: string | null = null;
        if (address) {
          const raw = await client.publicClient.readContract({
            address: client.usdcAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          });
          balance = formatUsdc(raw, client.usdcDecimals);
        }
        return ok({
          network: client.publicClient.chain ? `${client.publicClient.chain.name} (chain ${client.publicClient.chain.id})` : "Arc",
          mandate_escrow: client.escrowAddress,
          writes_enabled: writesEnabled,
          vault: vault?.vaultAddress ?? null,
          wallet: address ?? null,
          wallet_usdc_balance: balance,
          session_budget_usdc: config.sessionBudgetUsdc,
          locked_this_session_usdc: formatUsdc(lockedThisSession, client.usdcDecimals),
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_mandate",
    {
      title: "Get a mandate",
      description: "Reads one mandate straight from the contract: status (Funded, Fulfilled, Released, Refunded), amount, funder, fulfiller, deadline and proof hash. Returns an error if the id does not exist.",
      inputSchema: { id: idSchema },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      try {
        const mandate = await client.getMandate(id);
        if (!mandate) return fail(new MandateError("NOT_FOUND", `Mandate #${id} does not exist.`));
        return ok(describeMandate(mandate, client.address, writesEnabled && !vault));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "list_mandates",
    {
      title: "List recent mandates",
      description: "Lists mandates newest first. Use limit and offset to page.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe("How many to return."),
        offset: z.number().int().min(0).default(0).describe("How many of the newest to skip."),
      },
      annotations: READ_ONLY,
    },
    async ({ limit, offset }) => {
      try {
        const mandates = await client.listMandates({ limit, offset });
        return ok({ count: mandates.length, mandates: mandates.map((m) => describeMandate(m, client.address, writesEnabled && !vault)) });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_reputation",
    {
      title: "Get an address's reputation",
      description: "Reads the on-chain reputation ledger entry for an address: mandates completed as fulfiller, mandates refunded, and total USDC settled. All zeros means the address has no history yet.",
      inputSchema: { address: addressSchema },
      annotations: READ_ONLY,
    },
    async ({ address }) => {
      try {
        const rep = await client.reputationOf(address);
        return ok({ address, completed: rep.completed, refunded: rep.refunded, volume_settled_usdc: rep.volumeSettledUsdc, page: `https://arcurrent.site/address/${address}` });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "verify_proof",
    {
      title: "Verify evidence against a mandate's proof",
      description: "Checks whether a piece of evidence text (a URL, a description, an IPFS CID) is exactly what the fulfiller committed to, by hashing it and comparing with the proof hash on-chain. Read-only.",
      inputSchema: { id: idSchema, evidence: z.string().min(1).max(10_000).describe("The evidence text to check.") },
      annotations: READ_ONLY,
    },
    async ({ id, evidence }) => {
      try {
        const result = await client.verifyProof(id, evidence);
        return ok({ id: String(id), matches: result.matches, computed_hash: result.computed, on_chain_hash: result.onChain });
      } catch (err) {
        return fail(err);
      }
    }
  );

  if (vault) {
    registerVaultTools(server, { vault, writesEnabled, budget, config, spent: () => lockedThisSession, addSpent: (n) => (lockedThisSession += n) });
    return server;
  }

  if (!writesEnabled) return server;

  server.registerTool(
    "create_mandate",
    {
      title: "Create and fund a mandate",
      description: "Locks USDC from this server's wallet in a new mandate. This moves real funds and cannot be undone except by refund after a deadline, so confirm the amount and fulfiller with the user first. Omit fulfiller to leave it open (whoever posts proof first is paid). Omit deadline_days and the funder has no refund path.",
      inputSchema: {
        amount_usdc: z.string().describe('Decimal USDC amount, e.g. "2.5". At most 6 decimals.'),
        fulfiller: addressSchema.optional().describe("Address allowed to post proof. Omit for an open mandate."),
        deadline_days: z.number().int().min(1).max(3650).optional().describe("Days until the funder may refund if no proof arrives."),
      },
      annotations: MOVES_FUNDS,
    },
    async ({ amount_usdc, fulfiller, deadline_days }) => {
      try {
        const amount = parseUsdc(amount_usdc, client.usdcDecimals);
        if (lockedThisSession + amount > budget) {
          throw new MandateError(
            "AMOUNT_OVER_CAP",
            `This would bring the session total to ${formatUsdc(lockedThisSession + amount, client.usdcDecimals)} USDC, over the ${config.sessionBudgetUsdc} USDC session budget. Restart the server to reset it, or raise MANDATE_SESSION_BUDGET_USDC.`
          );
        }
        const result = await client.createMandate({
          amountUsdc: amount_usdc,
          fulfiller: fulfiller as `0x${string}` | undefined,
          deadline: deadline_days ? { days: deadline_days } : undefined,
        });
        lockedThisSession += amount;
        return ok({
          mandate_id: result.mandateId.toString(),
          amount_usdc: amount_usdc,
          tx: result.hash,
          tx_url: result.explorerUrl,
          approval_tx: result.approval?.hash ?? null,
          page: `https://arcurrent.site/mandate/${result.mandateId}`,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "submit_proof",
    {
      title: "Submit proof as the fulfiller",
      description: "Posts a hash of your evidence text on a Funded mandate, as its designated fulfiller (or the first caller on an open mandate). The text itself is not stored on-chain; keep it so the funder can verify it.",
      inputSchema: { id: idSchema, evidence: z.string().min(1).max(10_000).describe("The evidence text to commit to (hashed before sending).") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ id, evidence }) => {
      try {
        const result = await client.submitProof(id, { text: evidence });
        return ok({ id: String(id), tx: result.hash, tx_url: result.explorerUrl });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "release_mandate",
    {
      title: "Release a mandate's funds",
      description: "Pays out the locked funds, funder only, and cannot be undone. With no splits the whole amount goes to the fulfiller. To split, pass splits whose amounts sum exactly to the locked amount; all payments happen atomically in one transaction. Confirm destinations with the user first.",
      inputSchema: {
        id: idSchema,
        splits: z
          .array(z.object({ to: addressSchema, amount_usdc: z.string() }))
          .min(1)
          .max(20)
          .optional()
          .describe("Optional payout split. Must sum exactly to the mandate amount."),
      },
      annotations: MOVES_FUNDS,
    },
    async ({ id, splits }) => {
      try {
        const result = await client.release(id, {
          splits: splits?.map((s) => ({ to: s.to as `0x${string}`, amountUsdc: s.amount_usdc })),
        });
        return ok({ id: String(id), tx: result.hash, tx_url: result.explorerUrl });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "refund_mandate",
    {
      title: "Refund an expired, unproven mandate",
      description: "Returns a mandate's funds to its funder once its deadline has passed with no proof. Fails if there is no deadline, the deadline has not passed, or proof was already posted.",
      inputSchema: { id: idSchema },
      annotations: MOVES_FUNDS,
    },
    async ({ id }) => {
      try {
        const result = await client.refund(id);
        return ok({ id: String(id), tx: result.hash, tx_url: result.explorerUrl });
      } catch (err) {
        return fail(err);
      }
    }
  );

  return server;
}
