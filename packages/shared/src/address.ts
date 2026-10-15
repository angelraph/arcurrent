import { isAddress } from "viem";

export type PayeeAddressCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a stored payee address can ever be paid. This is the agent-side twin
 * of parseAddress in apps/web/src/lib/address.ts (kept separate so the web
 * bundle does not pull in this package's Circle SDK): all-lowercase or
 * all-uppercase is accepted, mixed case must carry a correct EIP-55 checksum.
 *
 * A failure here is permanent. Retrying the same string on the next pass can
 * never succeed, so the caller should stop rather than loop on it.
 */
export function checkPayeeAddress(raw: string): PayeeAddressCheck {
  const value = raw.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return { ok: false, reason: "the destination is not a valid 0x-prefixed EVM address (42 characters)" };
  }
  const hex = value.slice(2);
  const isMixedCase = hex !== hex.toLowerCase() && hex !== hex.toUpperCase();
  if (isMixedCase && !isAddress(value, { strict: true })) {
    return {
      ok: false,
      reason: "the destination has mixed-case letters but fails its checksum, which usually means a typo",
    };
  }
  return { ok: true };
}
