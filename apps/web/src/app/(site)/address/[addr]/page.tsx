import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { getActiveArcNetwork, type Mandate } from "@arcurrent/shared";
import { getAddressProfile } from "@/lib/data";
import { formatUsdc } from "@/lib/format";
import { Nav } from "../../../nav";
import { Card, PageShell, shortAddress } from "../../../detail-parts";
import { MandateStatusPill } from "../../../status-pill";

export const dynamic = "force-dynamic";

function normalize(raw: string): `0x${string}` | null {
  if (!isAddress(raw, { strict: false })) return null;
  const checksummed = getAddress(raw);
  return /^0x0+$/.test(checksummed) ? null : checksummed;
}

export async function generateMetadata({ params }: { params: Promise<{ addr: string }> }): Promise<Metadata> {
  const { addr } = await params;
  const address = normalize(addr);
  return { title: address ? `${shortAddress(address)} · Arcurrent` : "Address · Arcurrent" };
}

function MandateList({ title, mandates, empty }: { title: string; mandates: Mandate[]; empty: string }) {
  return (
    <Card title={title}>
      {mandates.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {mandates.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
              <Link href={`/mandate/${m.id}`} className="font-mono text-accent hover:underline">
                #{m.id}
              </Link>
              <span className="font-mono">${formatUsdc(m.amountUsdc)}</span>
              <MandateStatusPill status={m.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function AddressPage({ params }: { params: Promise<{ addr: string }> }) {
  const { addr } = await params;
  const address = normalize(addr);
  if (!address) notFound();

  const network = getActiveArcNetwork();
  let profile;
  try {
    profile = await getAddressProfile(address);
  } catch {
    return (
      <div className="flex flex-1 flex-col">
        <Nav />
        <PageShell>
          <p className="rounded-xl border border-dashed border-warning p-6 text-center text-sm text-warning">
            On-chain data is temporarily unavailable. Try refreshing.
          </p>
        </PageShell>
      </div>
    );
  }

  const rep = profile?.reputation;
  const total = (rep?.completed ?? 0) + (rep?.refunded ?? 0);

  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <PageShell>
        <div className="flex flex-col gap-2" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>
          <Link href="/dashboard" className="text-xs text-muted hover:text-foreground">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Track record</h1>
          <code className="break-all font-mono text-xs text-foreground/80">{address}</code>
        </div>

        <Card title="Reputation, as recorded by the contract">
          {rep && total > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="font-mono text-2xl font-semibold">{rep.completed}</p>
                  <p className="text-xs text-muted">completed</p>
                </div>
                <div>
                  <p className="font-mono text-2xl font-semibold">{rep.refunded}</p>
                  <p className="text-xs text-muted">refunded</p>
                </div>
                <div>
                  <p className="font-mono text-2xl font-semibold">${formatUsdc(rep.volumeSettledUsdc)}</p>
                  <p className="text-xs text-muted">settled</p>
                </div>
              </div>
              <p className="text-xs text-muted">
                Credited to an address only when it is the fulfiller on a mandate that was released (completed) or refunded after no proof (refunded). It lives in the contract, not in this project&apos;s database, so any other app can read the same numbers.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No reputation yet. This address has not been the fulfiller on a settled mandate.</p>
          )}
        </Card>

        <MandateList title="Funded by this address" mandates={profile?.asFunder ?? []} empty="Has not funded any mandate." />
        <MandateList title="Fulfilling for others" mandates={profile?.asFulfiller ?? []} empty="Is not the fulfiller on any mandate." />

        <p className="text-xs text-muted">
          <a href={`${network.blockExplorer}/address/${address}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            View this address on the explorer ↗
          </a>
        </p>
      </PageShell>
    </div>
  );
}
