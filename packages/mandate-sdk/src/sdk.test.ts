import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  parseAbi,
  stringToHex,
  type Log,
  type PublicClient,
  type WalletClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { MandateClient, MandateError, formatUsdc, hashProof, parseUsdc, resolveSplits } from "./index.js";

const ESCROW = "0xca901f58fb82FE5FF459264a419b8cF8c75b3371" as const;
const ME = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const FEE = "0x3333333333333333333333333333333333333333" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const NO_HASH = `0x${"00".repeat(32)}` as const;
const PROOF = `0x${"ab".repeat(32)}` as const;
const TX = `0x${"cd".repeat(32)}` as const;

type Row = readonly [`0x${string}`, `0x${string}`, bigint, bigint, `0x${string}`, number];

const eventAbi = parseAbi([
  "event MandateCreated(uint256 indexed mandateId, address indexed funder, address indexed fulfiller, uint256 amount, uint256 deadline)",
]);

function createdLog(mandateId: bigint, funder: `0x${string}`, address: `0x${string}` = ESCROW): Log {
  return {
    address,
    topics: encodeEventTopics({ abi: eventAbi, eventName: "MandateCreated", args: { mandateId, funder, fulfiller: OTHER } }),
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [1n, 0n]),
  } as unknown as Log;
}

interface Setup {
  rows?: Record<string, Row>;
  nextId?: bigint;
  allowance?: bigint;
  balance?: bigint;
  logs?: Log[];
  simulateError?: Error;
  receiptStatus?: "success" | "reverted";
  receiptFailures?: number;
}

function setup(s: Setup = {}, clientOptions: ConstructorParameters<typeof MandateClient>[0] = {}) {
  const simulated: { functionName: string; args: unknown[] }[] = [];
  let receiptCalls = 0;

  const publicClient = {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      if (functionName === "mandates") {
        return s.rows?.[String(args![0])] ?? [ZERO, ZERO, 0n, 0n, NO_HASH, 0];
      }
      if (functionName === "nextMandateId") return s.nextId ?? 0n;
      if (functionName === "allowance") return s.allowance ?? 0n;
      if (functionName === "balanceOf") return s.balance ?? 10_000_000n;
      if (functionName === "reputationOf") return [3n, 1n, 4_500_000n];
      throw new Error(`unexpected read ${functionName}`);
    }),
    simulateContract: vi.fn(async (call: { functionName: string; args: unknown[] }) => {
      if (s.simulateError) throw s.simulateError;
      simulated.push({ functionName: call.functionName, args: call.args });
      return { request: { functionName: call.functionName, args: call.args } };
    }),
    getTransactionReceipt: vi.fn(async () => {
      receiptCalls++;
      if (receiptCalls <= (s.receiptFailures ?? 0)) throw new Error("not found");
      return { status: s.receiptStatus ?? "success", logs: s.logs ?? [] };
    }),
  } as unknown as PublicClient;

  const writes: unknown[] = [];
  const walletClient = {
    account: { address: ME },
    writeContract: vi.fn(async (req: unknown) => {
      writes.push(req);
      return TX;
    }),
  } as unknown as WalletClient;

  const client = new MandateClient({ publicClient, walletClient, receiptPollMs: 1, receiptTimeoutMs: 200, ...clientOptions });
  return { client, publicClient, walletClient, simulated, writes };
}

const funded = (over: Partial<{ funder: `0x${string}`; fulfiller: `0x${string}`; amount: bigint; deadline: bigint; proof: `0x${string}`; status: number }> = {}): Row => [
  over.funder ?? ME,
  over.fulfiller ?? OTHER,
  over.amount ?? 60_000n,
  over.deadline ?? 0n,
  over.proof ?? NO_HASH,
  over.status ?? 1,
];

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return err instanceof MandateError ? err.code : `OTHER:${String(err)}`;
  }
  return "NO_ERROR";
}

describe("parseUsdc / formatUsdc", () => {
  it("round-trips normal and sub-cent amounts", () => {
    for (const v of ["12.5", "0.000002", "3", "0.06", "1000000"]) expect(formatUsdc(parseUsdc(v))).toBe(v);
  });

  it("rejects exponents, signs, junk, empty, and over-precise input", () => {
    for (const v of ["1e3", "-1", "+1", "abc", "", "1.1234567", "1,5", " ", "."]) {
      expect(() => parseUsdc(v)).toThrow(MandateError);
    }
  });

  it("formats whole numbers without a decimal point", () => {
    expect(formatUsdc(2_000_000n)).toBe("2");
    expect(formatUsdc(0n)).toBe("0");
  });
});

describe("hashProof", () => {
  it("is keccak256 of the trimmed text", () => {
    expect(hashProof("  hello  ")).toBe(keccak256(stringToHex("hello")));
  });
});

describe("resolveSplits", () => {
  it("accepts parts that sum exactly", () => {
    const r = resolveSplits([{ to: OTHER, amountUsdc: "0.04" }, { to: FEE, amountUsdc: "0.02" }], 60_000n);
    expect(r.amounts).toEqual([40_000n, 20_000n]);
  });

  it("rejects wrong sums, zero parts, empty lists and bad or zero addresses", () => {
    expect(() => resolveSplits([{ to: OTHER, amountUsdc: "0.05" }], 60_000n)).toThrow(/sum/);
    expect(() => resolveSplits([{ to: OTHER, amountUsdc: "0" }, { to: FEE, amountUsdc: "0.06" }], 60_000n)).toThrow(MandateError);
    expect(() => resolveSplits([], 60_000n)).toThrow(MandateError);
    expect(() => resolveSplits([{ to: "0x123" as `0x${string}`, amountUsdc: "0.06" }], 60_000n)).toThrow(MandateError);
    expect(() => resolveSplits([{ to: ZERO, amountUsdc: "0.06" }], 60_000n)).toThrow(MandateError);
  });
});

describe("reads", () => {
  it("returns null for a never-created id and maps a real row", async () => {
    const { client } = setup({ rows: { "2": funded({ deadline: 1_900_000_000n, proof: PROOF, status: 2 }) } });
    expect(await client.getMandate(9)).toBeNull();
    const m = await client.getMandate(2);
    expect(m).toMatchObject({ id: 2n, status: "Fulfilled", amountUsdc: "0.06", deadline: 1_900_000_000, proofHash: PROOF, isOpen: false });
  });

  it("marks an unclaimed open mandate and maps zero deadline / hash to null", async () => {
    const { client } = setup({ rows: { "0": funded({ fulfiller: ZERO }) } });
    expect(await client.getMandate(0)).toMatchObject({ isOpen: true, deadline: null, proofHash: null });
  });

  it("lists newest first honouring limit and offset", async () => {
    const rows: Record<string, Row> = {};
    for (let i = 0; i < 5; i++) rows[String(i)] = funded({ amount: BigInt(i + 1) * 1000n });
    const { client } = setup({ rows, nextId: 5n });
    expect((await client.listMandates()).map((m) => Number(m.id))).toEqual([4, 3, 2, 1, 0]);
    expect((await client.listMandates({ limit: 2 })).map((m) => Number(m.id))).toEqual([4, 3]);
    expect((await client.listMandates({ limit: 2, offset: 3 })).map((m) => Number(m.id))).toEqual([1, 0]);
    expect(await client.listMandates({ offset: 10 })).toEqual([]);
  });

  it("reads reputation and rejects a malformed address", async () => {
    const { client } = setup();
    expect(await client.reputationOf(OTHER)).toEqual({ completed: 3, refunded: 1, volumeSettled: 4_500_000n, volumeSettledUsdc: "4.5" });
    expect(await code(client.reputationOf("nope"))).toBe("INVALID_ADDRESS");
  });

  it("verifies evidence against the on-chain proof hash", async () => {
    const { client } = setup({ rows: { "1": funded({ proof: hashProof("the evidence"), status: 2 }) } });
    expect((await client.verifyProof(1, "the evidence")).matches).toBe(true);
    expect((await client.verifyProof(1, "something else")).matches).toBe(false);
  });
});

describe("createMandate", () => {
  it("approves the exact amount when allowance is short, then creates, and reads the id from its own event", async () => {
    const { client, simulated } = setup({
      allowance: 0n,
      logs: [createdLog(41n, OTHER), createdLog(42n, ME)],
    });
    const result = await client.createMandate({ amountUsdc: "0.06", fulfiller: OTHER });
    expect(result.mandateId).toBe(42n);
    expect(result.approval).not.toBeNull();
    expect(simulated.map((s) => s.functionName)).toEqual(["approve", "createMandate"]);
    expect(simulated[0].args[1]).toBe(60_000n);
    expect(simulated[1].args).toEqual([OTHER, 60_000n, 0n]);
  });

  it("skips the approval when the allowance already covers it", async () => {
    const { client, simulated } = setup({ allowance: 1_000_000n, logs: [createdLog(7n, ME)] });
    const result = await client.createMandate({ amountUsdc: "0.06" });
    expect(result.approval).toBeNull();
    expect(simulated.map((s) => s.functionName)).toEqual(["createMandate"]);
    expect(simulated[0].args[0]).toBe(ZERO);
  });

  it("can approve the maximum when asked to", async () => {
    const { client, simulated } = setup({ logs: [createdLog(1n, ME)] }, { approveMax: true });
    await client.createMandate({ amountUsdc: "0.06" });
    expect(simulated[0].args[1]).toBe(2n ** 256n - 1n);
  });

  it("enforces the spend cap before touching the chain", async () => {
    const { client, publicClient, walletClient } = setup({}, { maxAmountUsdc: "5" });
    expect(await code(client.createMandate({ amountUsdc: "5.000001" }))).toBe("AMOUNT_OVER_CAP");
    expect(publicClient.readContract).not.toHaveBeenCalled();
    expect(walletClient.writeContract).not.toHaveBeenCalled();
    await expect(client.createMandate({ amountUsdc: "5" })).rejects.not.toMatchObject({ code: "AMOUNT_OVER_CAP" });
  });

  it("rejects bad amounts, addresses and deadlines up front", async () => {
    const { client } = setup();
    expect(await code(client.createMandate({ amountUsdc: "0" }))).toBe("INVALID_AMOUNT");
    expect(await code(client.createMandate({ amountUsdc: "abc" }))).toBe("INVALID_AMOUNT");
    expect(await code(client.createMandate({ amountUsdc: "1", fulfiller: "0x12" as `0x${string}` }))).toBe("INVALID_ADDRESS");
    expect(await code(client.createMandate({ amountUsdc: "1", deadline: { days: 0 } }))).toBe("INVALID_DEADLINE");
    expect(await code(client.createMandate({ amountUsdc: "1", deadline: { unix: 100 } }))).toBe("INVALID_DEADLINE");
  });

  it("refuses when the wallet cannot cover the amount", async () => {
    const { client, walletClient } = setup({ balance: 1000n });
    expect(await code(client.createMandate({ amountUsdc: "1" }))).toBe("INSUFFICIENT_BALANCE");
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("fails clearly when a read-only client tries to write", async () => {
    const client = new MandateClient({ publicClient: setup().publicClient });
    expect(await code(client.createMandate({ amountUsdc: "1" }))).toBe("NO_WALLET");
  });

  it("reports EVENT_NOT_FOUND if the receipt has no matching creation event", async () => {
    const { client } = setup({ allowance: 10n ** 9n, logs: [createdLog(5n, OTHER)] });
    expect(await code(client.createMandate({ amountUsdc: "0.06" }))).toBe("EVENT_NOT_FOUND");
  });

  it("ignores creation events emitted by some other contract", async () => {
    const { client } = setup({ allowance: 10n ** 9n, logs: [createdLog(5n, ME, "0x9999999999999999999999999999999999999999")] });
    expect(await code(client.createMandate({ amountUsdc: "0.06" }))).toBe("EVENT_NOT_FOUND");
  });
});

describe("release", () => {
  it("defaults to paying the whole amount to the fulfiller", async () => {
    const { client, simulated } = setup({ rows: { "3": funded() } });
    await client.release(3);
    expect(simulated[0]).toEqual({ functionName: "release", args: [3n, [OTHER], [60_000n]] });
  });

  it("does an atomic split when asked", async () => {
    const { client, simulated } = setup({ rows: { "3": funded({ status: 2 }) } });
    await client.release(3, { splits: [{ to: OTHER, amountUsdc: "0.04" }, { to: FEE, amountUsdc: "0.02" }] });
    expect(simulated[0].args).toEqual([3n, [OTHER, FEE], [40_000n, 20_000n]]);
  });

  it("rejects a bad split before any gas is spent", async () => {
    const { client, walletClient } = setup({ rows: { "3": funded() } });
    expect(await code(client.release(3, { splits: [{ to: OTHER, amountUsdc: "0.01" }] }))).toBe("INVALID_SPLITS");
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("is funder only", async () => {
    const { client } = setup({ rows: { "3": funded({ funder: OTHER }) } });
    expect(await code(client.release(3))).toBe("NOT_AUTHORIZED");
  });

  it("refuses a mandate that is already final, and one that does not exist", async () => {
    const { client } = setup({ rows: { "3": funded({ status: 3 }) } });
    expect(await code(client.release(3))).toBe("WRONG_STATUS");
    expect(await code(client.release(99))).toBe("NOT_FOUND");
  });

  it("requires explicit splits for an open mandate nobody has claimed", async () => {
    const { client } = setup({ rows: { "3": funded({ fulfiller: ZERO }) } });
    expect(await code(client.release(3))).toBe("INVALID_SPLITS");
  });
});

describe("submitProof", () => {
  it("hashes text evidence and submits it as the designated fulfiller", async () => {
    const { client, simulated } = setup({ rows: { "4": funded({ funder: OTHER, fulfiller: ME }) } });
    await client.submitProof(4, { text: " delivered " });
    expect(simulated[0]).toEqual({ functionName: "submitProof", args: [4n, hashProof("delivered")] });
  });

  it("lets anyone claim an open mandate, but nobody but the fulfiller on a designated one", async () => {
    const open = setup({ rows: { "4": funded({ fulfiller: ZERO }) } });
    await expect(open.client.submitProof(4, { hash: PROOF })).resolves.toBeDefined();
    const closed = setup({ rows: { "4": funded({ fulfiller: OTHER }) } });
    expect(await code(closed.client.submitProof(4, { hash: PROOF }))).toBe("NOT_AUTHORIZED");
  });

  it("rejects empty text, malformed or zero hashes, and a mandate past Funded", async () => {
    const { client } = setup({ rows: { "4": funded({ fulfiller: ME }), "5": funded({ fulfiller: ME, status: 2 }) } });
    expect(await code(client.submitProof(4, { text: "   " }))).toBe("INVALID_AMOUNT");
    expect(await code(client.submitProof(4, { hash: "0x12" as `0x${string}` }))).toBe("INVALID_AMOUNT");
    expect(await code(client.submitProof(4, { hash: NO_HASH }))).toBe("INVALID_AMOUNT");
    expect(await code(client.submitProof(5, { hash: PROOF }))).toBe("WRONG_STATUS");
  });
});

describe("refund", () => {
  it("refuses with no deadline, before the deadline, and after proof", async () => {
    const future = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const { client } = setup({
      rows: { "1": funded(), "2": funded({ deadline: future }), "3": funded({ deadline: 1n, status: 2 }) },
    });
    expect(await code(client.refund(1))).toBe("WRONG_STATUS");
    expect(await code(client.refund(2))).toBe("DEADLINE_NOT_REACHED");
    expect(await code(client.refund(3))).toBe("WRONG_STATUS");
  });

  it("goes through once the deadline has passed", async () => {
    const { client, simulated } = setup({ rows: { "1": funded({ deadline: 1n }) } });
    await client.refund(1);
    expect(simulated[0]).toEqual({ functionName: "refund", args: [1n] });
  });
});

describe("failure handling", () => {
  it("turns a simulated revert into CONTRACT_REVERT without sending anything", async () => {
    const { client, walletClient } = setup({ rows: { "3": funded() }, simulateError: new Error("only the funder can release") });
    expect(await code(client.release(3))).toBe("CONTRACT_REVERT");
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("keeps polling until the receipt shows up", async () => {
    const { client, publicClient } = setup({ rows: { "3": funded() }, receiptFailures: 3 });
    await client.release(3);
    expect((publicClient.getTransactionReceipt as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });

  it("reports a mined-but-reverted transaction and a receipt timeout", async () => {
    const reverted = setup({ rows: { "3": funded() }, receiptStatus: "reverted" });
    expect(await code(reverted.client.release(3))).toBe("TX_REVERTED");
    const slow = setup({ rows: { "3": funded() }, receiptFailures: 10_000 });
    expect(await code(slow.client.release(3))).toBe("RECEIPT_TIMEOUT");
  });
});
