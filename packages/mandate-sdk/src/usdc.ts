import { MandateError } from "./errors.js";

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Parses a decimal USDC string ("12.5") to base units. Strict on purpose:
 * no exponents, no signs, no surrounding junk, and never more precision than
 * the token has. Silently rounding money is how agents lose it.
 */
export function parseUsdc(value: string, decimals = 6): bigint {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new MandateError("INVALID_AMOUNT", `"${value}" is not a plain decimal USDC amount (e.g. "12.5").`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new MandateError("INVALID_AMOUNT", `"${value}" has more than ${decimals} decimal places.`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/** Base units back to a decimal string with no trailing zeros ("12.5", "0.000002", "3"). */
export function formatUsdc(amount: bigint, decimals = 6): string {
  const negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
