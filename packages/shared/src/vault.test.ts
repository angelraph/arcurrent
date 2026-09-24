import { keccak256, stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import { gateFromCheck, refForObligation } from "./vault.js";

describe("gateFromCheck", () => {
  it("lets a passing pre-flight through", () => {
    expect(gateFromCheck({ ok: true })).toBeNull();
  });

  it("holds (wait) for every rule the owner controls", () => {
    for (const code of ["OVER_DAILY_ALLOWANCE", "OVER_PER_PAYMENT_CAP", "PAYEE_NOT_ALLOWED", "PAUSED", "INVALID_PAYEE", "NOT_AUTHORIZED"] as const) {
      const gate = gateFromCheck({ ok: false, code, message: "because" });
      expect(gate?.action).toBe("wait");
      expect(gate?.reasoning).toBe("Held by the vault's rules: because");
    }
  });

  it("calls an empty vault insufficient_funds, like a low treasury used to be", () => {
    expect(gateFromCheck({ ok: false, code: "INSUFFICIENT_BALANCE", message: "empty" })?.action).toBe("insufficient_funds");
  });
});

describe("refForObligation", () => {
  it("is a stable 32-byte hash of the obligation id", () => {
    const ref = refForObligation("3f2b8c1e-0000-4000-8000-000000000001");
    expect(ref).toBe(keccak256(stringToHex("3f2b8c1e-0000-4000-8000-000000000001")));
    expect(ref).toMatch(/^0x[0-9a-f]{64}$/);
    expect(refForObligation("a")).not.toBe(refForObligation("b"));
  });
});
