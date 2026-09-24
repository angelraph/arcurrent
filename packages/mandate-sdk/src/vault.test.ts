import { encodeAbiParameters, encodeEventTopics, keccak256, stringToHex, type Log, type PublicClient, type WalletClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { MandateError, VaultClient, agentVaultAbi } from "./index.js";

const VAULT = "0x5555555555555555555555555555555555555555" as const;
const ESCROW = "0xca901f58fb82FE5FF459264a419b8cF8c75b3371" as const;
const USDC = "0x3600000000000000000000000000000000000000" as const;
const OWNER = "0x00000000000000000000000000000000000000a1" as const;
const OPERATOR = "0x00000000000000000000000000000000000000b1" as const;
const GUARDIAN = "0x00000000000000000000000000000000000000c1" as const;
const PAYEE = "0x00000000000000000000000000000000000000d1" as const;
const TX = `0x${"cd".repeat(32)}` as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

interface PolicyState {
  operator: `0x${string}`;
  perPaymentCap: bigint;
  dailyCap: bigint;
  available: bigint;
  allowlistRequired: boolean;
  paused: boolean;
  balance: bigint;
  allowed: boolean;
  owner: `0x${string}`;
  guardian: `0x${string}`;
  pendingOwner: `0x${string}`;
  logs: Log[];
  simulateError: Error | null;
}

const defaults = (): PolicyState => ({
  operator: OPERATOR,
  perPaymentCap: 1_000_000n,
  dailyCap: 5_000_000n,
  available: 5_000_000n,
  allowlistRequired: true,
  paused: false,
  balance: 100_000_000n,
  allowed: true,
  owner: OWNER,
  guardian: GUARDIAN,
  pendingOwner: ZERO,
  logs: [],
  simulateError: null,
});

function paidLog(mandateId: bigint, address: `0x${string}` = VAULT): Log {
  return {
    address,
    topics: encodeEventTopics({ abi: agentVaultAbi, eventName: "Paid", args: { operator: OPERATOR, to: PAYEE, mandateId } }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [500_000n, `0x${"00".repeat(32)}`]),
  } as unknown as Log;
}

function setup(over: Partial<PolicyState> = {}, caller: `0x${string}` = OPERATOR) {
  const s = { ...defaults(), ...over };
  const simulated: { functionName: string; args: unknown[] | undefined }[] = [];

  const publicClient = {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      switch (functionName) {
        case "policy":
          return {
            owner: s.owner,
            operator: s.operator,
            guardian: s.guardian,
            perPaymentCap: s.perPaymentCap,
            dailyCap: s.dailyCap,
            available: s.available,
            allowlistRequired: s.allowlistRequired,
            paused: s.paused,
            balance: s.balance,
          };
        case "isAllowedPayee":
          return s.allowed;
        case "escrow":
          return ESCROW;
        case "usdc":
          return USDC;
        case "owner":
          return s.owner;
        case "guardian":
          return s.guardian;
        case "pendingOwner":
          return s.pendingOwner;
        default:
          throw new Error(`unexpected read ${functionName} ${String(args)}`);
      }
    }),
    simulateContract: vi.fn(async (call: { functionName: string; args?: unknown[] }) => {
      if (s.simulateError) throw s.simulateError;
      simulated.push({ functionName: call.functionName, args: call.args });
      return { request: { functionName: call.functionName } };
    }),
    getTransactionReceipt: vi.fn(async () => ({ status: "success", logs: s.logs })),
  } as unknown as PublicClient;

  const walletClient = { account: { address: caller }, writeContract: vi.fn(async () => TX) } as unknown as WalletClient;
  const client = new VaultClient({ vaultAddress: VAULT, publicClient, walletClient, receiptPollMs: 1, receiptTimeoutMs: 100 });
  return { client, simulated, walletClient, publicClient };
}

const refusal = async (p: Promise<{ ok: boolean; code?: string }>) => {
  const r = await p;
  return r.ok ? "OK" : r.code;
};

describe("getPolicy", () => {
  it("maps the on-chain policy with decimal strings", async () => {
    const { client } = setup();
    expect(await client.getPolicy()).toMatchObject({
      owner: OWNER,
      operator: OPERATOR,
      perPaymentCapUsdc: "1",
      dailyCapUsdc: "5",
      availableUsdc: "5",
      balanceUsdc: "100",
      allowlistRequired: true,
      paused: false,
    });
  });
});

describe("checkPay", () => {
  it("passes a payment inside every rule", async () => {
    const { client } = setup();
    expect(await client.checkPay({ to: PAYEE, amountUsdc: "0.5" })).toEqual({ ok: true });
  });

  it("refuses each rule with its own code", async () => {
    expect(await refusal(setup({}, GUARDIAN).client.checkPay({ to: PAYEE, amountUsdc: "0.5" }))).toBe("NOT_AUTHORIZED");
    expect(await refusal(setup({ paused: true }).client.checkPay({ to: PAYEE, amountUsdc: "0.5" }))).toBe("PAUSED");
    expect(await refusal(setup().client.checkPay({ to: PAYEE, amountUsdc: "1.000001" }))).toBe("OVER_PER_PAYMENT_CAP");
    expect(await refusal(setup({ allowed: false }).client.checkPay({ to: PAYEE, amountUsdc: "0.5" }))).toBe("PAYEE_NOT_ALLOWED");
    expect(await refusal(setup({ available: 100_000n }).client.checkPay({ to: PAYEE, amountUsdc: "0.5" }))).toBe("OVER_DAILY_ALLOWANCE");
    expect(await refusal(setup({ balance: 100_000n }).client.checkPay({ to: PAYEE, amountUsdc: "0.5" }))).toBe("INSUFFICIENT_BALANCE");
  });

  it("does not require the allowlist when it is switched off", async () => {
    const { client } = setup({ allowlistRequired: false, allowed: false });
    expect(await client.checkPay({ to: PAYEE, amountUsdc: "0.5" })).toEqual({ ok: true });
  });

  it("refuses payees that would strand the funds, even with the allowlist off", async () => {
    const { client } = setup({ allowlistRequired: false });
    for (const to of [ZERO, VAULT, ESCROW, USDC]) {
      expect(await refusal(client.checkPay({ to, amountUsdc: "0.5" }))).toBe("INVALID_PAYEE");
    }
  });

  it("rejects malformed input without touching the chain", async () => {
    const { client, publicClient } = setup();
    expect(await refusal(client.checkPay({ to: "0x12", amountUsdc: "1" }))).toBe("INVALID_ADDRESS");
    expect(await refusal(client.checkPay({ to: PAYEE, amountUsdc: "abc" }))).toBe("INVALID_AMOUNT");
    expect(await refusal(client.checkPay({ to: PAYEE, amountUsdc: "0" }))).toBe("INVALID_AMOUNT");
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it("says how long until the daily allowance covers a payment", async () => {
    // 1 USDC missing at 5 USDC/day is 4.8 hours: 288 minutes.
    const { client } = setup({ available: 0n });
    const r = await client.checkPay({ to: PAYEE, amountUsdc: "1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/288 minute/);
  });

  it("can check as a named operator without a wallet attached", async () => {
    const publicClient = setup().publicClient;
    const readOnly = new VaultClient({ vaultAddress: VAULT, publicClient });
    expect(await readOnly.checkPay({ to: PAYEE, amountUsdc: "0.5" }, OPERATOR)).toEqual({ ok: true });
    expect(await refusal(readOnly.checkPay({ to: PAYEE, amountUsdc: "0.5" }, GUARDIAN))).toBe("NOT_AUTHORIZED");
  });
});

describe("pay", () => {
  it("sends one pay call and returns the mandate id from the vault's own Paid event", async () => {
    const { client, simulated } = setup({ logs: [paidLog(7n, "0x9999999999999999999999999999999999999999"), paidLog(9n)] });
    const result = await client.pay({ to: PAYEE, amountUsdc: "0.5", ref: "obligation-1" });
    expect(result.mandateId).toBe(9n);
    expect(simulated).toHaveLength(1);
    expect(simulated[0].functionName).toBe("pay");
    expect(simulated[0].args).toEqual([PAYEE, 500_000n, keccak256(stringToHex("obligation-1"))]);
  });

  it("uses a ready 32-byte ref as-is and a zero ref when none is given", async () => {
    const ref = `0x${"ab".repeat(32)}` as const;
    const a = setup({ logs: [paidLog(1n)] });
    await a.client.pay({ to: PAYEE, amountUsdc: "0.5", ref });
    expect(a.simulated[0].args?.[2]).toBe(ref);
    const b = setup({ logs: [paidLog(1n)] });
    await b.client.pay({ to: PAYEE, amountUsdc: "0.5" });
    expect(b.simulated[0].args?.[2]).toBe(`0x${"00".repeat(32)}`);
  });

  it("refuses with the specific rule and sends nothing", async () => {
    const { client, walletClient, simulated } = setup({ paused: true });
    await expect(client.pay({ to: PAYEE, amountUsdc: "0.5" })).rejects.toMatchObject({ code: "PAUSED" });
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    expect(simulated).toHaveLength(0);
  });

  it("reports a missing Paid event and a contract revert distinctly", async () => {
    const noEvent = setup({ logs: [] });
    await expect(noEvent.client.pay({ to: PAYEE, amountUsdc: "0.5" })).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    const reverts = setup({ simulateError: new Error("over daily allowance") });
    await expect(reverts.client.pay({ to: PAYEE, amountUsdc: "0.5" })).rejects.toMatchObject({ code: "CONTRACT_REVERT" });
  });

  it("needs a wallet", async () => {
    const client = new VaultClient({ vaultAddress: VAULT, publicClient: setup().publicClient });
    await expect(client.pay({ to: PAYEE, amountUsdc: "0.5" })).rejects.toMatchObject({ code: "NO_WALLET" });
  });
});

describe("owner methods", () => {
  it("send when called by the owner", async () => {
    const { client, simulated } = setup({}, OWNER);
    await client.setLimits({ perPaymentUsdc: "2", dailyUsdc: "10" });
    await client.setAllowlistRequired(false);
    await client.setPayee(PAYEE, true);
    await client.setPayees([PAYEE, GUARDIAN], false);
    await client.setOperator(null);
    await client.setGuardian(GUARDIAN);
    await client.unpause();
    await client.withdraw(OWNER, "3");
    await client.transferOwnership(GUARDIAN);
    expect(simulated.map((s) => s.functionName)).toEqual([
      "setLimits", "setAllowlistRequired", "setPayee", "setPayees", "setOperator", "setGuardian", "unpause", "withdraw", "transferOwnership",
    ]);
    expect(simulated[0].args).toEqual([2_000_000n, 10_000_000n]);
    expect(simulated[4].args).toEqual([ZERO]);
    expect(simulated[7].args).toEqual([OWNER, 3_000_000n]);
  });

  it("refuse anyone who is not the owner before sending", async () => {
    const { client, walletClient } = setup({}, OPERATOR);
    const attempts = [
      client.setLimits({ perPaymentUsdc: "2", dailyUsdc: "10" }),
      client.setAllowlistRequired(false),
      client.setPayee(PAYEE, true),
      client.setOperator(null),
      client.unpause(),
      client.withdraw(OPERATOR, "1"),
      client.transferOwnership(OPERATOR),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("validates limits and amounts locally", async () => {
    const { client } = setup({}, OWNER);
    await expect(client.setLimits({ perPaymentUsdc: "0", dailyUsdc: "5" })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(client.setLimits({ perPaymentUsdc: "5", dailyUsdc: "4" })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(client.withdraw(OWNER, "0")).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(client.withdraw(OWNER, "1000")).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    await expect(client.setPayees([], true)).rejects.toBeInstanceOf(MandateError);
  });

  it("lets the owner or guardian pause but nobody else", async () => {
    await expect(setup({}, OWNER).client.pause()).resolves.toBeDefined();
    await expect(setup({}, GUARDIAN).client.pause()).resolves.toBeDefined();
    await expect(setup({}, OPERATOR).client.pause()).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
  });

  it("only lets the pending owner accept ownership", async () => {
    const yes = setup({ pendingOwner: GUARDIAN }, GUARDIAN);
    await expect(yes.client.acceptOwnership()).resolves.toBeDefined();
    const no = setup({ pendingOwner: GUARDIAN }, OPERATOR);
    await expect(no.client.acceptOwnership()).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
  });
});
