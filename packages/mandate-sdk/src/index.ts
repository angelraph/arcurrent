export { MandateClient, type MandateClientOptions } from "./client.js";
export {
  ARC_MAINNET,
  arcMainnetChain,
  erc20Abi,
  mandateEscrowAbi,
  MANDATE_STATUSES,
  type MandateStatus,
} from "./constants.js";
export { MandateError, type MandateErrorCode } from "./errors.js";
export { hashProof } from "./proof.js";
export { resolveSplits, type ResolvedSplits, type Split } from "./splits.js";
export type {
  CreateMandateParams,
  CreateMandateResult,
  Mandate,
  ProofInput,
  Reputation,
  TxResult,
} from "./types.js";
export { formatUsdc, parseUsdc } from "./usdc.js";
