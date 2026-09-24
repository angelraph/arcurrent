import { keccak256, stringToHex, type Hex } from "viem";

/**
 * The hash committed on-chain for a piece of proof: keccak256 of the trimmed
 * UTF-8 text. Identical to what the Arcurrent dashboard's "Submit proof" and
 * proof verifier compute, so evidence checks out across every client.
 */
export function hashProof(text: string): Hex {
  return keccak256(stringToHex(text.trim()));
}
