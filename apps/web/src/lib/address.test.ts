import { describe, expect, it } from "vitest";
import { parseAddress } from "./address";

const LOWER = "0xfde19f3bcd5482544ce672391d839a56da96bfee";
const CHECKSUMMED = "0xFde19f3BCd5482544ce672391d839a56dA96BFEE";
// The casing typed by hand during the live test that the agent rejected.
const WRONG_CHECKSUM = "0xfdE19f3bcd5482544cE672391d839a56Da96bFee";

describe("parseAddress", () => {
  it("normalizes all-lowercase to the checksummed form", () => {
    expect(parseAddress(LOWER)).toEqual({ ok: true, address: CHECKSUMMED });
  });

  it("accepts a correct checksum unchanged", () => {
    expect(parseAddress(CHECKSUMMED)).toEqual({ ok: true, address: CHECKSUMMED });
  });

  it("trims surrounding whitespace", () => {
    expect(parseAddress(`  ${LOWER}\n`)).toEqual({ ok: true, address: CHECKSUMMED });
  });

  it("rejects mixed case that fails the checksum instead of silently fixing it", () => {
    const result = parseAddress(WRONG_CHECKSUM);
    expect(result.ok).toBe(false);
  });

  it("rejects wrong length and non-hex", () => {
    expect(parseAddress("0x1234").ok).toBe(false);
    expect(parseAddress("0x" + "g".repeat(40)).ok).toBe(false);
    expect(parseAddress("").ok).toBe(false);
  });
});
