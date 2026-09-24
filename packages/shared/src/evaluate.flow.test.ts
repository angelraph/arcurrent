import { beforeEach, describe, expect, it, vi } from "vitest";

// The evaluation loop's I/O, replaced with fakes so the decision logic can be
// exercised end to end: Supabase (a recording fake), and the vault (policy
// reads, pre-flight, and the Circle-backed payment).
const state = vi.hoisted(() => ({
  obligations: [] as Record<string, unknown>[],
  updates: [] as { patch: Record<string, unknown>; id: unknown }[],
  decisions: [] as Record<string, unknown>[],
  policy: { balanceUsdc: "100", availableUsdc: "5" } as { balanceUsdc: string; availableUsdc: string },
  check: { ok: true } as { ok: boolean; code?: string; message?: string },
  pay: vi.fn(),
}));

vi.mock("./supabase.js", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: state.obligations, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => ({
          eq: () => ({
            select: async () => {
              state.updates.push({ patch, id });
              return { data: [{ id }], error: null };
            },
          }),
          then: (resolve: (v: unknown) => unknown) => {
            state.updates.push({ patch, id });
            return Promise.resolve({ error: null }).then(resolve);
          },
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        if (table === "agent_decisions") state.decisions.push(row);
        return { error: null };
      },
    }),
  }),
}));

vi.mock("./vault.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("./vault.js")>();
  return {
    ...real,
    getVaultClient: () => ({
      getPolicy: async () => state.policy,
      checkPay: async () => state.check,
    }),
    payViaVault: (...args: unknown[]) => state.pay(...args),
  };
});

const { evaluatePendingObligations } = await import("./evaluate.js");

const VAULT = "0x5555555555555555555555555555555555555555" as const;
const config = {
  walletId: "wallet-1",
  walletAddress: "0x00000000000000000000000000000000000000b1",
  vaultAddress: VAULT,
  reserveThresholdUsdc: 0.05,
  payAheadWindowDays: 3,
};

function obligation(over: Record<string, unknown> = {}) {
  return {
    id: "ob-1",
    vendor_name: "Acme",
    amount: 0.5,
    currency: "USDC",
    due_date: new Date().toISOString().slice(0, 10),
    destination_address: "0x00000000000000000000000000000000000000d1",
    status: "pending",
    created_at: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  state.obligations = [obligation()];
  state.updates = [];
  state.decisions = [];
  state.policy = { balanceUsdc: "100", availableUsdc: "5" };
  state.check = { ok: true };
  state.pay = vi.fn(async () => ({ transactionId: "circle-tx-1", mandateId: "7" }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("evaluatePendingObligations through the vault", () => {
  it("pays a payable obligation through the vault and records the mandate", async () => {
    const summary = await evaluatePendingObligations(config);
    expect(summary).toEqual({ evaluated: 1, actions: { pay_now: 1 }, failed: 0 });
    expect(state.pay).toHaveBeenCalledTimes(1);
    expect(state.pay.mock.calls[0][0]).toMatchObject({
      walletId: "wallet-1",
      vaultAddress: VAULT,
      obligationId: "ob-1",
      destinationAddress: "0x00000000000000000000000000000000000000d1",
      amountUsdc: 0.5,
    });
    expect(state.updates).toEqual([{ patch: { status: "scheduled" }, id: "ob-1" }]);
    expect(state.decisions[0]).toMatchObject({ action: "pay_now", tx_hash: "circle-tx-1" });
    expect(String(state.decisions[0].reasoning)).toContain("mandate #7");
  });

  it("decides against the vault's balance, not the agent wallet's", async () => {
    state.policy = { balanceUsdc: "0.1", availableUsdc: "5" };
    await evaluatePendingObligations(config);
    expect(state.pay).not.toHaveBeenCalled();
    expect(state.decisions[0].action).not.toBe("pay_now");
    expect(state.decisions[0].signals).toMatchObject({ treasuryBalanceUsdc: 0.1 });
  });

  it("turns a payment the vault would refuse into a logged hold, leaving the obligation pending", async () => {
    state.check = { ok: false, code: "OVER_DAILY_ALLOWANCE", message: "Only 0.1 USDC of the daily allowance is available." };
    const summary = await evaluatePendingObligations(config);
    expect(state.pay).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
    expect(summary.actions).toEqual({ wait: 1 });
    expect(state.decisions[0]).toMatchObject({ action: "wait", tx_hash: null });
    expect(String(state.decisions[0].reasoning)).toContain("Held by the vault's rules");
    expect(state.decisions[0].signals).toMatchObject({ heldByVault: "OVER_DAILY_ALLOWANCE", vaultAvailableUsdc: "5" });
  });

  it("holds an obligation whose payee the owner has not allowed", async () => {
    state.check = { ok: false, code: "PAYEE_NOT_ALLOWED", message: "Not on the allowlist." };
    await evaluatePendingObligations(config);
    expect(state.decisions[0]).toMatchObject({ action: "wait" });
    expect(state.pay).not.toHaveBeenCalled();
  });

  it("records a vault that simply lacks the funds as insufficient_funds", async () => {
    state.check = { ok: false, code: "INSUFFICIENT_BALANCE", message: "The vault holds less." };
    await evaluatePendingObligations(config);
    expect(state.decisions[0]).toMatchObject({ action: "insufficient_funds" });
    expect(state.pay).not.toHaveBeenCalled();
  });

  it("releases the claim and logs the failure when Circle never accepted the payment", async () => {
    state.pay = vi.fn(async () => {
      throw new Error("Circle is down");
    });
    const summary = await evaluatePendingObligations(config);
    expect(summary.failed).toBe(1);
    expect(state.updates).toEqual([
      { patch: { status: "scheduled" }, id: "ob-1" },
      { patch: { status: "pending" }, id: "ob-1" },
    ]);
    expect(state.decisions[0]).toMatchObject({ action: "insufficient_funds" });
    expect(String(state.decisions[0].reasoning)).toContain("Circle is down");
  });

  it("keeps a submitted payment claimed even when its confirmation is not seen yet", async () => {
    state.pay = vi.fn(async () => ({ transactionId: "circle-tx-9", mandateId: null }));
    await evaluatePendingObligations(config);
    // Only the claim happened: no release back to pending, so it can never be paid twice.
    expect(state.updates).toEqual([{ patch: { status: "scheduled" }, id: "ob-1" }]);
    expect(state.decisions[0]).toMatchObject({ action: "pay_now", tx_hash: "circle-tx-9" });
    expect(String(state.decisions[0].reasoning)).toContain("Submitted through the vault");
  });

  it("does not consult the vault's pre-flight for obligations that are not payable now", async () => {
    state.obligations = [obligation({ due_date: "2099-01-01" })];
    await evaluatePendingObligations(config);
    expect(state.pay).not.toHaveBeenCalled();
    expect(state.decisions[0].action).toBe("wait");
    expect(state.decisions[0].signals).not.toHaveProperty("heldByVault");
  });
});
