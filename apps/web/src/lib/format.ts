/** 2 decimals for normal amounts; more precision for sub-cent amounts so they don't read as "$0.00". */
export function formatUsdc(amount: number): string {
  if (amount !== 0 && Math.abs(amount) < 0.01) {
    return amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0");
  }
  return amount.toFixed(2);
}

/**
 * "3 minutes ago", down to the second for the first minute so a visitor who
 * just triggered an evaluation can watch it move. Never a future-tense
 * string: clock skew between this server and the timestamp's source clamps
 * to "just now" instead of "-3 seconds ago".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
