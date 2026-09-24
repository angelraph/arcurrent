import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MandateError, type Mandate, type MandateClient, type VaultClient } from "@arcurrent/mandate-sdk";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";
import { createMandateServer } from "./server.js";

const ME = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const TX = `0x${"cd".repeat(32)}` as const;
const KEY = `0x${"11".repeat(32)}`;

const mandate = (over: Partial<Mandate> = {}): Mandate => ({
  id: 3n,
  funder: ME,
  fulfiller: OTHER,
  isOpen: false,
  amount: 60_000n,
  amountUsdc: "0.06",
  deadline: null,
  proofHash: null,
  status: "Funded",
  ...over,
});

function stubClient(address: `0x${string}` | undefined = undefined) {
  const stub = {
    address,
    escrowAddress: "0xca901f58fb82FE5FF459264a419b8cF8c75b3371",
    usdcAddress: "0x3600000000000000000000000000000000000000",
    usdcDecimals: 6,
    publicClient: { readContract: vi.fn(async () => 2_500_000n) },
    getMandate: vi.fn(async (id: number) => (id === 3 ? mandate() : null)),
    listMandates: vi.fn(async () => [mandate()]),
    reputationOf: vi.fn(async () => ({ completed: 2, refunded: 0, volumeSettled: 80_000n, volumeSettledUsdc: "0.08" })),
    verifyProof: vi.fn(async () => ({ matches: true, computed: TX, onChain: TX })),
    createMandate: vi.fn(async () => ({ mandateId: 9n, hash: TX, explorerUrl: `https://explorer.arc.io/tx/${TX}`, approval: null })),
    submitProof: vi.fn(async () => ({ hash: TX, explorerUrl: "u" })),
    release: vi.fn(async () => ({ hash: TX, explorerUrl: "u" })),
    refund: vi.fn(async () => ({ hash: TX, explorerUrl: "u" })),
  };
  return stub;
}

async function connect(
  stub: ReturnType<typeof stubClient>,
  over: { writesEnabled?: boolean; sessionBudgetUsdc?: string; vault?: ReturnType<typeof stubVault> } = {}
) {
  const server = createMandateServer({
    client: stub as unknown as MandateClient,
    writesEnabled: over.writesEnabled ?? false,
    sessionBudgetUsdc: over.sessionBudgetUsdc ?? "20",
    vault: over.vault as unknown as VaultClient | undefined,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const VAULT = "0x5555555555555555555555555555555555555555" as const;

function stubVault(address: `0x${string}` | undefined = ME) {
  return {
    vaultAddress: VAULT,
    address,
    usdcDecimals: 6,
    getPolicy: vi.fn(async () => ({
      owner: OTHER,
      operator: ME,
      guardian: OTHER,
      perPaymentCapUsdc: "1",
      dailyCapUsdc: "5",
      availableUsdc: "2.5",
      balanceUsdc: "10",
      allowlistRequired: true,
      paused: false,
    })),
    checkPay: vi.fn(async () => ({ ok: true }) as { ok: boolean; code?: string; message?: string }),
    pay: vi.fn(async () => ({ mandateId: 12n, hash: TX, explorerUrl: `https://explorer.arc.io/tx/${TX}` })),
  };
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // validation errors come back as plain text
  }
  return { isError: Boolean(result.isError), text, json: json as Record<string, unknown> };
}

describe("tool surface", () => {
  it("is strictly read-only unless writes are enabled", async () => {
    const client = await connect(stubClient());
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_config", "get_mandate", "get_reputation", "list_mandates", "verify_proof"]);
  });

  it("adds exactly the four fund-moving tools when writes are enabled, marked destructive", async () => {
    const client = await connect(stubClient(ME), { writesEnabled: true });
    const tools = (await client.listTools()).tools;
    const names = tools.map((t) => t.name);
    for (const n of ["create_mandate", "submit_proof", "release_mandate", "refund_mandate"]) expect(names).toContain(n);
    expect(names).toHaveLength(9);
    expect(tools.find((t) => t.name === "release_mandate")?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === "get_mandate")?.annotations?.readOnlyHint).toBe(true);
  });
});

describe("read tools", () => {
  it("get_mandate returns the mandate and a page link", async () => {
    const client = await connect(stubClient());
    const { json, isError } = await call(client, "get_mandate", { id: 3 });
    expect(isError).toBe(false);
    expect(json).toMatchObject({ id: "3", status: "Funded", amount_usdc: "0.06", funder: ME, fulfiller: OTHER, open_to_any_fulfiller: false });
    expect(String(json.page)).toContain("/mandate/3");
    expect(json.actions_available_to_this_wallet).toBeUndefined();
  });

  it("returns a structured NOT_FOUND error for a missing mandate", async () => {
    const client = await connect(stubClient());
    const { json, isError } = await call(client, "get_mandate", { id: 99 });
    expect(isError).toBe(true);
    expect(json.error).toBe("NOT_FOUND");
  });

  it("rejects malformed input before it reaches the client", async () => {
    const stub = stubClient();
    const client = await connect(stub);
    expect((await call(client, "get_reputation", { address: "abc" })).isError).toBe(true);
    expect((await call(client, "get_mandate", { id: -1 })).isError).toBe(true);
    expect((await call(client, "get_mandate", { id: 1.5 })).isError).toBe(true);
    expect(stub.reputationOf).not.toHaveBeenCalled();
  });

  it("reports reputation and verifies proofs", async () => {
    const client = await connect(stubClient());
    expect((await call(client, "get_reputation", { address: OTHER })).json).toMatchObject({ completed: 2, volume_settled_usdc: "0.08" });
    expect((await call(client, "verify_proof", { id: 3, evidence: "x" })).json).toMatchObject({ matches: true });
  });

  it("tells a write-enabled wallet what it can do next", async () => {
    const asFunder = await connect(stubClient(ME), { writesEnabled: true });
    expect((await call(asFunder, "get_mandate", { id: 3 })).json).toMatchObject({
      this_wallet: { role: "funder" },
      actions_available_to_this_wallet: ["release_mandate"],
    });
    const asFulfiller = await connect(stubClient(OTHER), { writesEnabled: true });
    expect((await call(asFulfiller, "get_mandate", { id: 3 })).json).toMatchObject({
      this_wallet: { role: "fulfiller" },
      actions_available_to_this_wallet: ["submit_proof"],
    });
  });

  it("get_config shows the wallet balance and limits", async () => {
    const client = await connect(stubClient(ME), { writesEnabled: true, sessionBudgetUsdc: "7" });
    expect((await call(client, "get_config")).json).toMatchObject({ writes_enabled: true, wallet: ME, wallet_usdc_balance: "2.5", session_budget_usdc: "7" });
  });
});

describe("write tools", () => {
  it("create_mandate forwards the request and returns the id and explorer link", async () => {
    const stub = stubClient(ME);
    const client = await connect(stub, { writesEnabled: true });
    const { json } = await call(client, "create_mandate", { amount_usdc: "2.5", fulfiller: OTHER, deadline_days: 7 });
    expect(stub.createMandate).toHaveBeenCalledWith({ amountUsdc: "2.5", fulfiller: OTHER, deadline: { days: 7 } });
    expect(json).toMatchObject({ mandate_id: "9", tx: TX });
  });

  it("enforces the session budget across calls and never calls the client once over it", async () => {
    const stub = stubClient(ME);
    const client = await connect(stub, { writesEnabled: true, sessionBudgetUsdc: "10" });
    expect((await call(client, "create_mandate", { amount_usdc: "6" })).isError).toBe(false);
    const second = await call(client, "create_mandate", { amount_usdc: "5" });
    expect(second.isError).toBe(true);
    expect(second.json.error).toBe("AMOUNT_OVER_CAP");
    expect(stub.createMandate).toHaveBeenCalledTimes(1);
    expect((await call(client, "create_mandate", { amount_usdc: "4" })).isError).toBe(false);
  });

  it("does not count a failed create against the budget", async () => {
    const stub = stubClient(ME);
    stub.createMandate.mockRejectedValueOnce(new MandateError("INSUFFICIENT_BALANCE", "nope"));
    const client = await connect(stub, { writesEnabled: true, sessionBudgetUsdc: "5" });
    expect((await call(client, "create_mandate", { amount_usdc: "5" })).json.error).toBe("INSUFFICIENT_BALANCE");
    expect((await call(client, "create_mandate", { amount_usdc: "5" })).isError).toBe(false);
  });

  it("release_mandate maps splits to the SDK shape", async () => {
    const stub = stubClient(ME);
    const client = await connect(stub, { writesEnabled: true });
    await call(client, "release_mandate", { id: 3, splits: [{ to: OTHER, amount_usdc: "0.04" }, { to: ME, amount_usdc: "0.02" }] });
    expect(stub.release).toHaveBeenCalledWith(3, { splits: [{ to: OTHER, amountUsdc: "0.04" }, { to: ME, amountUsdc: "0.02" }] });
    await call(client, "release_mandate", { id: 3 });
    expect(stub.release).toHaveBeenLastCalledWith(3, { splits: undefined });
  });

  it("surfaces SDK error codes and rejects bad addresses in splits", async () => {
    const stub = stubClient(ME);
    stub.release.mockRejectedValueOnce(new MandateError("NOT_AUTHORIZED", "Only the funder can release."));
    const client = await connect(stub, { writesEnabled: true });
    expect((await call(client, "release_mandate", { id: 3 })).json.error).toBe("NOT_AUTHORIZED");
    const bad = await call(client, "release_mandate", { id: 3, splits: [{ to: "0x12", amount_usdc: "1" }] });
    expect(bad.isError).toBe(true);
    expect(stub.release).toHaveBeenCalledTimes(1);
  });

  it("submit_proof and refund_mandate call through", async () => {
    const stub = stubClient(OTHER);
    const client = await connect(stub, { writesEnabled: true });
    await call(client, "submit_proof", { id: 3, evidence: "done" });
    expect(stub.submitProof).toHaveBeenCalledWith(3, { text: "done" });
    await call(client, "refund_mandate", { id: 3 });
    expect(stub.refund).toHaveBeenCalledWith(3);
  });
});

describe("loadConfig", () => {
  it("defaults to read-only with no wallet", () => {
    const { config, notices } = loadConfig({});
    expect(config.writesEnabled).toBe(false);
    expect(config.client.address).toBeUndefined();
    expect(notices[0]).toMatch(/Read-only/);
  });

  it("ignores a private key unless writes are explicitly enabled", () => {
    const { config, notices } = loadConfig({ MANDATE_PRIVATE_KEY: KEY });
    expect(config.writesEnabled).toBe(false);
    expect(config.client.address).toBeUndefined();
    expect(notices.join(" ")).toMatch(/ignored/);
  });

  it("enables writes only with both the flag and a key, and never prints the key", () => {
    const { config, notices } = loadConfig({ MANDATE_PRIVATE_KEY: KEY, MANDATE_ENABLE_WRITES: "true", MANDATE_MAX_USDC: "2", MANDATE_SESSION_BUDGET_USDC: "9" });
    expect(config.writesEnabled).toBe(true);
    expect(config.client.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.sessionBudgetUsdc).toBe("9");
    expect(notices.join(" ")).not.toContain(KEY.slice(2));
  });

  it("fails loudly on unsafe or malformed settings", () => {
    expect(() => loadConfig({ MANDATE_ENABLE_WRITES: "true" })).toThrow(/needs MANDATE_PRIVATE_KEY/);
    expect(() => loadConfig({ MANDATE_PRIVATE_KEY: "0x123" })).toThrow(/32-byte/);
    expect(() => loadConfig({ MANDATE_ESCROW_ADDRESS: "0xnope" })).toThrow(/valid 0x address/);
    expect(() => loadConfig({ MANDATE_MAX_USDC: "lots" })).toThrow();
    expect(() => loadConfig({ MANDATE_SESSION_BUDGET_USDC: "-5" })).toThrow();
  });
});

describe("vault mode", () => {
  const RAW_WRITES = ["create_mandate", "submit_proof", "release_mandate", "refund_mandate"];

  it("read-only vault mode adds the inspection tools and no way to pay", async () => {
    const client = await connect(stubClient(), { vault: stubVault(undefined) });
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["check_vault_payment", "get_config", "get_mandate", "get_reputation", "get_vault", "list_mandates", "verify_proof"]);
  });

  it("with writes on, vault_pay exists and the unrestricted fund-moving tools do not", async () => {
    const client = await connect(stubClient(ME), { writesEnabled: true, vault: stubVault() });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("vault_pay");
    for (const raw of RAW_WRITES) expect(names).not.toContain(raw);
    expect((await client.listTools()).tools.find((t) => t.name === "vault_pay")?.annotations?.destructiveHint).toBe(true);
  });

  it("get_vault reports the rules and whether this wallet is the operator", async () => {
    const client = await connect(stubClient(ME), { writesEnabled: true, vault: stubVault(ME) });
    expect((await call(client, "get_vault")).json).toMatchObject({
      vault: VAULT,
      balance_usdc: "10",
      per_payment_cap_usdc: "1",
      daily_cap_usdc: "5",
      available_now_usdc: "2.5",
      allowlist_required: true,
      paused: false,
      this_wallet_is_operator: true,
    });
  });

  it("check_vault_payment says yes, or why not", async () => {
    const vault = stubVault();
    const client = await connect(stubClient(ME), { writesEnabled: true, vault });
    expect((await call(client, "check_vault_payment", { to: OTHER, amount_usdc: "0.5" })).json).toEqual({ ok: true });
    vault.checkPay.mockResolvedValueOnce({ ok: false, code: "PAYEE_NOT_ALLOWED", message: "Ask the owner." });
    expect((await call(client, "check_vault_payment", { to: OTHER, amount_usdc: "0.5" })).json).toEqual({
      ok: false,
      reason: "PAYEE_NOT_ALLOWED",
      message: "Ask the owner.",
    });
  });

  it("vault_pay pays through the vault and returns the mandate", async () => {
    const vault = stubVault();
    const client = await connect(stubClient(ME), { writesEnabled: true, vault });
    const { json } = await call(client, "vault_pay", { to: OTHER, amount_usdc: "0.5", ref: "invoice 7" });
    expect(vault.pay).toHaveBeenCalledWith({ to: OTHER, amountUsdc: "0.5", ref: "invoice 7" });
    expect(json).toMatchObject({ mandate_id: "12", tx: TX, to: OTHER });
  });

  it("surfaces the vault's own refusal as a structured error", async () => {
    const vault = stubVault();
    vault.pay.mockRejectedValueOnce(new MandateError("OVER_DAILY_ALLOWANCE", "Used up; refills in 40 minutes."));
    const client = await connect(stubClient(ME), { writesEnabled: true, vault });
    const { json, isError } = await call(client, "vault_pay", { to: OTHER, amount_usdc: "0.5" });
    expect(isError).toBe(true);
    expect(json.error).toBe("OVER_DAILY_ALLOWANCE");
  });

  it("still applies the session budget on top of the vault's own limits", async () => {
    const vault = stubVault();
    const client = await connect(stubClient(ME), { writesEnabled: true, sessionBudgetUsdc: "1", vault });
    expect((await call(client, "vault_pay", { to: OTHER, amount_usdc: "0.75" })).isError).toBe(false);
    const over = await call(client, "vault_pay", { to: OTHER, amount_usdc: "0.5" });
    expect(over.json.error).toBe("AMOUNT_OVER_CAP");
    expect(vault.pay).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed vault_pay input before it reaches the vault", async () => {
    const vault = stubVault();
    const client = await connect(stubClient(ME), { writesEnabled: true, vault });
    expect((await call(client, "vault_pay", { to: "0x12", amount_usdc: "1" })).isError).toBe(true);
    expect((await call(client, "vault_pay", { to: OTHER, amount_usdc: "abc" })).isError).toBe(true);
    expect(vault.pay).not.toHaveBeenCalled();
  });

  it("does not offer the raw-tool action hints on a mandate", async () => {
    const client = await connect(stubClient(ME), { writesEnabled: true, vault: stubVault() });
    expect((await call(client, "get_mandate", { id: 3 })).json.actions_available_to_this_wallet).toBeUndefined();
  });
});

describe("loadConfig with a vault", () => {
  const VAULT_ENV = "0x5555555555555555555555555555555555555555";

  it("rejects a malformed vault address", () => {
    expect(() => loadConfig({ MANDATE_VAULT_ADDRESS: "0xnope" })).toThrow(/MANDATE_VAULT_ADDRESS/);
  });

  it("attaches a vault read-only when there is no key", () => {
    const { config, notices } = loadConfig({ MANDATE_VAULT_ADDRESS: VAULT_ENV });
    expect(config.vault?.vaultAddress).toBe(VAULT_ENV);
    expect(config.writesEnabled).toBe(false);
    expect(notices.join(" ")).toMatch(/read-only/);
  });

  it("goes into vault mode as the operator when the key and the write flag are set", () => {
    const { config, notices } = loadConfig({ MANDATE_VAULT_ADDRESS: VAULT_ENV, MANDATE_PRIVATE_KEY: KEY, MANDATE_ENABLE_WRITES: "true" });
    expect(config.vault?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.writesEnabled).toBe(true);
    expect(notices.join(" ")).toMatch(/Vault mode/);
    expect(notices.join(" ")).not.toContain(KEY.slice(2));
  });
});

describe("loadConfig network", () => {
  it("defaults to mainnet and rejects an unknown network", () => {
    expect(() => loadConfig({ MANDATE_NETWORK: "goerli" })).toThrow(/mainnet.*testnet/);
    expect(loadConfig({}).config.client.publicClient.chain?.id).toBe(5042);
  });

  it("targets testnet only when the escrow address is given, since the mainnet contract does not exist there", () => {
    expect(() => loadConfig({ MANDATE_NETWORK: "testnet" })).toThrow(/MANDATE_ESCROW_ADDRESS is required on testnet/);
    const { config } = loadConfig({ MANDATE_NETWORK: "testnet", MANDATE_ESCROW_ADDRESS: "0xe57B47DC952eDFFfd397bf682282b0f6a8C3d983" });
    expect(config.client.publicClient.chain?.id).toBe(5042002);
  });
});
