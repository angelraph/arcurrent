import { isAddress } from "viem";

/**
 * A payment request is just a prefilled link: "fund a mandate for this
 * address, this amount". Nothing is stored anywhere and nothing is trusted --
 * the payer sees every field on the page and again in their own wallet before
 * signing, and the money goes into escrow (they release it), not to the
 * requester. Client-safe on purpose (no @arcurrent/shared import).
 */
export const MAX_NOTE_LENGTH = 80;
export const MAX_DEADLINE_DAYS = 3650;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const AMOUNT_PATTERN = /^\d+(\.\d{1,6})?$/;
const DAYS_PATTERN = /^\d+$/;

export interface PaymentRequest {
  to: `0x${string}`;
  /** Decimal USDC string, at most 6 decimals. */
  amount: string;
  note: string;
  /** Whole days until the payer could refund, or "" for no deadline. */
  days: string;
}

export type ParsedRequest = { ok: true; request: PaymentRequest } | { ok: false; error: string };

function cleanNote(raw: string): string {
  // Control characters have no place in a one-line note; strip rather than reject.
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NOTE_LENGTH);
}

export function validateRequest(input: { to: string; amount: string; note?: string; days?: string }): ParsedRequest {
  const to = input.to.trim();
  if (!isAddress(to) || to.toLowerCase() === ZERO_ADDRESS) {
    return { ok: false, error: "The recipient must be a valid, non-zero 0x address." };
  }
  const amount = input.amount.trim();
  if (!AMOUNT_PATTERN.test(amount) || Number(amount) <= 0) {
    return { ok: false, error: "The amount must be a positive USDC number with at most 6 decimals." };
  }
  const days = (input.days ?? "").trim();
  if (days !== "") {
    if (!DAYS_PATTERN.test(days) || Number(days) < 1 || Number(days) > MAX_DEADLINE_DAYS) {
      return { ok: false, error: `The refund deadline must be a whole number of days between 1 and ${MAX_DEADLINE_DAYS}.` };
    }
  }
  return { ok: true, request: { to: to as `0x${string}`, amount, note: cleanNote(input.note ?? ""), days } };
}

export function buildRequestPath(request: { to: string; amount: string; note?: string; days?: string }): string {
  const params = new URLSearchParams({ to: request.to.trim(), amount: request.amount.trim() });
  const note = cleanNote(request.note ?? "");
  if (note) params.set("note", note);
  const days = (request.days ?? "").trim();
  if (days) params.set("days", days);
  return `/request?${params.toString()}`;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Returns null when the URL carries no request at all (show the generator), an error result when it carries a bad one. */
export function parseRequestParams(params: SearchParams): ParsedRequest | null {
  if (first(params.to) === "" && first(params.amount) === "") return null;
  return validateRequest({
    to: first(params.to),
    amount: first(params.amount),
    note: first(params.note),
    days: first(params.days),
  });
}
