import { encodeEventTopics, encodeAbiParameters, parseAbi, type Log } from "viem";
import { describe, expect, it } from "vitest";
import { findMandateIdFromCreatedLogs } from "./mandate.js";

const eventAbi = parseAbi([
  "event MandateCreated(uint256 indexed mandateId, address indexed funder, address indexed fulfiller, uint256 amount, uint256 deadline)",
]);

function mandateCreatedLog(params: {
  mandateId: bigint;
  funder: `0x${string}`;
  fulfiller: `0x${string}`;
  amount: bigint;
  deadline: bigint;
}): Log {
  const topics = encodeEventTopics({
    abi: eventAbi,
    eventName: "MandateCreated",
    args: { mandateId: params.mandateId, funder: params.funder, fulfiller: params.fulfiller },
  });
  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }],
    [params.amount, params.deadline]
  );
  return {
    address: "0x1111111111111111111111111111111111111111",
    topics,
    data,
    blockNumber: 1n,
    blockHash: "0x00",
    transactionHash: "0x00",
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  } as Log;
}

const funder = "0x00000000000000000000000000000000000000a1" as `0x${string}`;
const otherFunder = "0x00000000000000000000000000000000000000b2" as `0x${string}`;
const fulfiller = "0x00000000000000000000000000000000000000c3" as `0x${string}`;

describe("findMandateIdFromCreatedLogs", () => {
  it("returns the mandateId from this funder's MandateCreated log", () => {
    const log = mandateCreatedLog({ mandateId: 7n, funder, fulfiller, amount: 100n, deadline: 0n });
    expect(findMandateIdFromCreatedLogs([log], funder)).toBe(7n);
  });

  it("is case-insensitive when matching the funder address", () => {
    const log = mandateCreatedLog({ mandateId: 7n, funder, fulfiller, amount: 100n, deadline: 0n });
    expect(findMandateIdFromCreatedLogs([log], funder.toLowerCase() as `0x${string}`)).toBe(7n);
  });

  it("skips logs belonging to a different funder", () => {
    const log = mandateCreatedLog({ mandateId: 7n, funder: otherFunder, fulfiller, amount: 100n, deadline: 0n });
    expect(findMandateIdFromCreatedLogs([log], funder)).toBeNull();
  });

  it("skips non-MandateCreated logs (e.g. the USDC Transfer log in the same receipt) without throwing", () => {
    const transferLog = {
      address: "0x3600000000000000000000000000000000000000",
      topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
      data: "0x00",
      blockNumber: 1n,
      blockHash: "0x00",
      transactionHash: "0x00",
      transactionIndex: 0,
      logIndex: 0,
      removed: false,
    } as Log;
    const mandateLog = mandateCreatedLog({ mandateId: 3n, funder, fulfiller, amount: 100n, deadline: 0n });
    expect(findMandateIdFromCreatedLogs([transferLog, mandateLog], funder)).toBe(3n);
  });

  it("returns null when no matching log is present", () => {
    expect(findMandateIdFromCreatedLogs([], funder)).toBeNull();
  });
});
