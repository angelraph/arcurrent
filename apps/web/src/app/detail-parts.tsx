import Link from "next/link";

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const ZERO_ADDRESS_PATTERN = /^0x0+$/;

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
      {title && <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/** An address that links to its on-chain track record page, with the full value on hover. */
export function AddressLink({ address }: { address: string }) {
  return (
    <Link href={`/address/${address}`} title={address} className="font-mono text-accent hover:underline">
      {shortAddress(address)}
    </Link>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">{children}</div>;
}
