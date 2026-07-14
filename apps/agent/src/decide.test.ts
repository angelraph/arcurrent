import { describe, expect, it } from "vitest";
import { decide } from "./decide.js";
import type { Obligation } from "@arcurrent/shared";

const baseObligation: Obligation = {
  id: "test-obligation",
  vendorName: "Test Vendor",
  amount: 1000,
  currency: "USDC",
  dueDate: "2026-07-16",
  destinationAddress: "0x0000000000000000000000000000000000dEaD",
  status: "pending",
  createdAt: "2026-07-14T00:00:00.000Z",
};

const now = new Date("2026-07-14T00:00:00.000Z");

describe("decide", () => {
  it("pays now when due soon and balance covers amount plus reserve", () => {
    const result = decide({
      obligation: baseObligation,
      treasuryBalanceUsdc: 5000,
      reserveThresholdUsdc: 500,
      payAheadWindowDays: 3,
      now,
    });
    expect(result.action).toBe("pay_now");
  });

  it("waits when due date is outside the pay-ahead window", () => {
    const result = decide({
      obligation: { ...baseObligation, dueDate: "2026-07-30" },
      treasuryBalanceUsdc: 5000,
      reserveThresholdUsdc: 500,
      payAheadWindowDays: 3,
      now,
    });
    expect(result.action).toBe("wait");
  });

  it("reports insufficient funds when balance is below the obligation amount", () => {
    const result = decide({
      obligation: baseObligation,
      treasuryBalanceUsdc: 200,
      reserveThresholdUsdc: 500,
      payAheadWindowDays: 3,
      now,
    });
    expect(result.action).toBe("insufficient_funds");
  });

  it("requests liquidity when payment would breach the reserve floor", () => {
    const result = decide({
      obligation: baseObligation,
      treasuryBalanceUsdc: 1200,
      reserveThresholdUsdc: 500,
      payAheadWindowDays: 3,
      now,
    });
    expect(result.action).toBe("request_liquidity");
  });

  it("flags non-USDC obligations for currency conversion", () => {
    const result = decide({
      obligation: { ...baseObligation, currency: "EURC" },
      treasuryBalanceUsdc: 5000,
      reserveThresholdUsdc: 500,
      payAheadWindowDays: 3,
      now,
    });
    expect(result.action).toBe("convert_currency");
  });
});
