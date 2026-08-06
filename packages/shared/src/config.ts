/**
 * Strict numeric env-var parsing for financial config values. Unlike a plain
 * `Number(process.env.X ?? "0")`, this refuses to silently substitute a
 * default when the variable is missing or unparseable, since a wrong default
 * here (e.g. a $0 reserve floor) is a safety failure, not a convenience one.
 */
export function requireEnvNumber(value: string | undefined, name: string): number {
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} must be set, refusing to silently default a financial config value.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a valid number, got "${value}".`);
  }
  return n;
}
