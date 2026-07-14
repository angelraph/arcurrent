/** 2 decimals for normal amounts; more precision for sub-cent amounts so they don't read as "$0.00". */
export function formatUsdc(amount: number): string {
  if (amount !== 0 && Math.abs(amount) < 0.01) {
    return amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0");
  }
  return amount.toFixed(2);
}
