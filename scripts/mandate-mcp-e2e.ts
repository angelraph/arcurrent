import { config } from "dotenv";
config({ path: ".env" });
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * End-to-end check of the real built MCP server (packages/mandate-mcp/dist),
 * spawned as a stdio subprocess exactly the way an agent host would, against
 * Arc mainnet.
 *
 *   npx tsx scripts/mandate-mcp-e2e.ts            read-only checks (free)
 *   npx tsx scripts/mandate-mcp-e2e.ts --write    also runs a real create -> proof ->
 *                                                 release cycle with 0.000001 USDC from
 *                                                 ARC_MAINNET_DEPLOYER_PRIVATE_KEY (real,
 *                                                 sub-cent cost)
 */
const write = process.argv.includes("--write");

async function open(env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["packages/mandate-mcp/dist/index.js"],
    env: { ...(process.env as Record<string, string>), MANDATE_PRIVATE_KEY: "", MANDATE_ENABLE_WRITES: "", ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(transport);
  return { client, transport };
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0].text;
  return { isError: Boolean(res.isError), data: JSON.parse(text) as Record<string, unknown> };
}

function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

async function main() {
  const ro = await open({});
  const tools = (await ro.client.listTools()).tools.map((t) => t.name);
  check("read-only server exposes no fund-moving tools", !tools.includes("create_mandate") && !tools.includes("release_mandate"), tools.join(","));

  const m = await call(ro.client, "get_mandate", { id: 4 });
  check("get_mandate #4 reads the real split-release mandate", m.data.status === "Released" && m.data.amount_usdc === "0.06");
  const missing = await call(ro.client, "get_mandate", { id: 9999 });
  check("get_mandate on a missing id is a structured error", missing.isError && missing.data.error === "NOT_FOUND");
  const rep = await call(ro.client, "get_reputation", { address: "0xFde19f3BCd5482544ce672391d839a56dA96BFEE" });
  check("get_reputation reads the ledger", Number(rep.data.completed) >= 5, `completed=${rep.data.completed}`);
  const list = await call(ro.client, "list_mandates", { limit: 2 });
  check("list_mandates returns newest first", (list.data.mandates as { id: string }[])[0].id > (list.data.mandates as { id: string }[])[1].id);
  await ro.client.close();

  if (!write) {
    console.log("\nRead-only checks done. Re-run with --write for the real create/proof/release cycle.");
    return;
  }

  const key = process.env.ARC_MAINNET_DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("ARC_MAINNET_DEPLOYER_PRIVATE_KEY is not set.");
  const rw = await open({ MANDATE_PRIVATE_KEY: key, MANDATE_ENABLE_WRITES: "true" });
  const cfg = await call(rw.client, "get_config");
  const me = cfg.data.wallet as string;
  check("write server reports its wallet and limits", cfg.data.writes_enabled === true && cfg.data.session_budget_usdc === "20");

  const overCap = await call(rw.client, "create_mandate", { amount_usdc: "6" });
  check("a 6 USDC mandate is refused by the 5 USDC per-mandate cap", overCap.isError && overCap.data.error === "AMOUNT_OVER_CAP");

  const created = await call(rw.client, "create_mandate", { amount_usdc: "0.000001", fulfiller: me });
  check("create_mandate locks 0.000001 USDC", !created.isError, String(created.data.tx_url ?? created.data.message));
  if (created.isError) return;
  const id = Number(created.data.mandate_id);

  const before = await call(rw.client, "get_mandate", { id });
  check("the new mandate is Funded and offers submit_proof and release", before.data.status === "Funded", JSON.stringify(before.data.actions_available_to_this_wallet));

  const evidence = `mcp-e2e ${new Date().toISOString()}`;
  const proof = await call(rw.client, "submit_proof", { id, evidence });
  check("submit_proof posts the hash", !proof.isError, String(proof.data.tx_url ?? proof.data.message));
  const verified = await call(rw.client, "verify_proof", { id, evidence });
  check("verify_proof confirms the same evidence", verified.data.matches === true);
  const wrong = await call(rw.client, "verify_proof", { id, evidence: "different" });
  check("verify_proof rejects different evidence", wrong.data.matches === false);

  const released = await call(rw.client, "release_mandate", { id });
  check("release_mandate pays out", !released.isError, String(released.data.tx_url ?? released.data.message));
  const after = await call(rw.client, "get_mandate", { id });
  check("the mandate ends Released", after.data.status === "Released");
  const again = await call(rw.client, "release_mandate", { id });
  check("a second release is refused with a clear error", again.isError && again.data.error === "WRONG_STATUS");

  console.log(`\nMandate #${id}: ${String(created.data.tx_url)}\n  release: ${String(released.data.tx_url)}`);
  await rw.client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
