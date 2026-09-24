import { config } from "dotenv";
config({ path: ".env" });
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * End-to-end check of the MCP server in VAULT MODE: the real built server,
 * spawned over stdio as an agent host would, paying through the Arc TESTNET
 * AgentVault created by scripts/vault-rehearsal.ts, using that rehearsal's
 * throwaway operator key. Nothing here touches mainnet or real funds.
 *
 *   npx tsx scripts/vault-mcp-e2e.ts
 *   (needs TESTNET_ESCROW and TESTNET_VAULT set to the deployed addresses)
 */
const stateFile = join(tmpdir(), "vault-rehearsal.json");
const escrow = process.env.TESTNET_ESCROW;
const vault = process.env.TESTNET_VAULT;
if (!existsSync(stateFile) || !escrow || !vault) {
  throw new Error("Run scripts/vault-rehearsal.ts first and set TESTNET_ESCROW and TESTNET_VAULT.");
}
const state = JSON.parse(readFileSync(stateFile, "utf8")) as { operatorKey: string; payee: string };

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!pass) failures++;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0].text;
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { isError: Boolean(res.isError), data };
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["packages/mandate-mcp/dist/index.js"],
    env: {
      ...(process.env as Record<string, string>),
      MANDATE_NETWORK: "testnet",
      MANDATE_ESCROW_ADDRESS: escrow!,
      MANDATE_VAULT_ADDRESS: vault!,
      MANDATE_PRIVATE_KEY: state.operatorKey,
      MANDATE_ENABLE_WRITES: "true",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "vault-e2e", version: "0" });
  await client.connect(transport);

  const names = (await client.listTools()).tools.map((t) => t.name);
  check("vault_pay is offered", names.includes("vault_pay"));
  check("the unrestricted tools are NOT offered", !["create_mandate", "release_mandate", "refund_mandate", "submit_proof"].some((n) => names.includes(n)), names.join(","));

  const info = await call(client, "get_vault");
  check("get_vault reads the live rules and knows it is the operator", info.data.this_wallet_is_operator === true && info.data.allowlist_required === true, `cap ${info.data.per_payment_cap_usdc}/payment, ${info.data.available_now_usdc} available`);

  const stranger = "0x00000000000000000000000000000000000000f1";
  const notAllowed = await call(client, "check_vault_payment", { to: stranger, amount_usdc: "0.1" });
  check("a payee the owner never approved is refused up front", notAllowed.data.ok === false && notAllowed.data.reason === "PAYEE_NOT_ALLOWED");
  const tooBig = await call(client, "check_vault_payment", { to: state.payee, amount_usdc: "1.5" });
  check("an amount over the per-payment cap is refused up front", tooBig.data.ok === false && tooBig.data.reason === "OVER_PER_PAYMENT_CAP");
  const forced = await call(client, "vault_pay", { to: stranger, amount_usdc: "0.1" });
  check("vault_pay to an unapproved payee fails and sends nothing", forced.isError && forced.data.error === "PAYEE_NOT_ALLOWED");

  const ok = await call(client, "check_vault_payment", { to: state.payee, amount_usdc: "0.25" });
  check("an approved payee within the caps passes the pre-check", ok.data.ok === true);
  const paid = await call(client, "vault_pay", { to: state.payee, amount_usdc: "0.25", ref: "mcp vault e2e" });
  check("vault_pay pays 0.25 USDC", !paid.isError, String(paid.data.tx_url ?? paid.data.message));
  if (!paid.isError) {
    const m = await call(client, "get_mandate", { id: Number(paid.data.mandate_id) });
    check("the payment is a Released mandate funded by the vault", m.data.status === "Released" && String(m.data.funder).toLowerCase() === vault!.toLowerCase());
  }

  await client.close();
  console.log(failures === 0 ? "\nAll vault-mode MCP checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
