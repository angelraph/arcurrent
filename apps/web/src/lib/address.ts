import { getAddress, isAddress } from "viem";

export type ParsedAddress = { ok: true; address: `0x${string}` } | { ok: false; error: string };

/**
 * A payee address typed into a form. All-lowercase or all-uppercase is
 * accepted and normalized to the checksummed form. Mixed case must carry a
 * correct EIP-55 checksum: the casing is the typo detector, so a mixed-case
 * address that fails it is almost certainly a mistyped or hand-edited one,
 * and the right response to a mistyped destination for real money is to
 * refuse, not to guess.
 */
export function parseAddress(raw: string): ParsedAddress {
  const value = raw.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return { ok: false, error: "Destination address must be a valid 0x-prefixed EVM address (42 characters)." };
  }
  const hex = value.slice(2);
  const isMixedCase = hex !== hex.toLowerCase() && hex !== hex.toUpperCase();
  if (isMixedCase && !isAddress(value, { strict: true })) {
    return {
      ok: false,
      error: "That address has mixed-case letters but fails its checksum, which usually means a typo. Paste it again exactly, or use all lowercase.",
    };
  }
  return { ok: true, address: getAddress(value) };
}
