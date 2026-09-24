export type MandateErrorCode =
  | "INVALID_AMOUNT"
  | "INVALID_ADDRESS"
  | "INVALID_SPLITS"
  | "INVALID_DEADLINE"
  | "AMOUNT_OVER_CAP"
  | "NO_WALLET"
  | "NOT_FOUND"
  | "WRONG_STATUS"
  | "NOT_AUTHORIZED"
  | "DEADLINE_NOT_REACHED"
  | "INSUFFICIENT_BALANCE"
  | "CONTRACT_REVERT"
  | "TX_REVERTED"
  | "RECEIPT_TIMEOUT"
  | "EVENT_NOT_FOUND"
  | "PAUSED"
  | "OVER_PER_PAYMENT_CAP"
  | "OVER_DAILY_ALLOWANCE"
  | "PAYEE_NOT_ALLOWED"
  | "INVALID_PAYEE";

/** Every failure the SDK raises on purpose, with a stable `code` callers (and agents) can branch on. */
export class MandateError extends Error {
  readonly code: MandateErrorCode;

  constructor(code: MandateErrorCode, message: string) {
    super(message);
    this.name = "MandateError";
    this.code = code;
  }
}
