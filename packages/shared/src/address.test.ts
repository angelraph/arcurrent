import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { checkPayeeAddress } from "./address.js";

const LOWER = "0xfde19f3bcd5482544ce672391d839a56da96bfee";
const CHECKSUMMED = getAddress(LOWER);

/** The checksummed address with one letter's case flipped: the typo the checksum exists to catch. */
function withBrokenChecksum(address: string): string {
  const i = address.slice(2).search(/[a-fA-F]/) + 2;
  const c = address[i];
  const flipped = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
  return address.slice(0, i) + flipped + address.slice(i + 1);
}

describe("checkPayeeAddress", () => {
  it("accepts all-lowercase, all-uppercase and a correct checksum", () => {
    expect(checkPayeeAddress(LOWER)).toEqual({ ok: true });
    expect(checkPayeeAddress(`0x${LOWER.slice(2).toUpperCase()}`)).toEqual({ ok: true });
    expect(checkPayeeAddress(CHECKSUMMED)).toEqual({ ok: true });
  });

  it("rejects a mixed-case address whose checksum is wrong", () => {
    const result = checkPayeeAddress(withBrokenChecksum(CHECKSUMMED));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("checksum");
  });

  it("rejects the wrong length or a missing prefix", () => {
    expect(checkPayeeAddress("0x1234").ok).toBe(false);
    expect(checkPayeeAddress(LOWER.slice(2)).ok).toBe(false);
    expect(checkPayeeAddress("").ok).toBe(false);
  });
});
