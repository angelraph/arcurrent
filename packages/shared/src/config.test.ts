import { describe, expect, it } from "vitest";
import { requireEnvNumber } from "./config.js";

describe("requireEnvNumber", () => {
  it("throws when the value is undefined", () => {
    expect(() => requireEnvNumber(undefined, "TREASURY_RESERVE_USDC")).toThrow(
      "TREASURY_RESERVE_USDC must be set"
    );
  });

  it("throws when the value is an empty or whitespace-only string", () => {
    expect(() => requireEnvNumber("", "TREASURY_RESERVE_USDC")).toThrow(
      "TREASURY_RESERVE_USDC must be set"
    );
    expect(() => requireEnvNumber("   ", "TREASURY_RESERVE_USDC")).toThrow(
      "TREASURY_RESERVE_USDC must be set"
    );
  });

  it("throws when the value is not a valid number", () => {
    expect(() => requireEnvNumber("abc", "TREASURY_RESERVE_USDC")).toThrow(
      'TREASURY_RESERVE_USDC must be a valid number, got "abc"'
    );
  });

  it("returns the parsed number for a valid value", () => {
    expect(requireEnvNumber("500", "TREASURY_RESERVE_USDC")).toBe(500);
  });

  it("returns 0 for an explicit \"0\", which is a valid reserve floor, not a missing one", () => {
    expect(requireEnvNumber("0", "TREASURY_RESERVE_USDC")).toBe(0);
  });
});
