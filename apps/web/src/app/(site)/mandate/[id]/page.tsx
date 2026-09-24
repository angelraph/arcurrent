import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveArcNetwork } from "@arcurrent/shared";
import { getMandateById } from "@/lib/data";
import { formatUsdc } from "@/lib/format";
import { Nav } from "../../../nav";
import { AddressLink, Card, Field, PageShell, ZERO_ADDRESS_PATTERN } from "../../../detail-parts";
import { ProofVerifier } from "../../../proof-verifier";
import { MandateStatusPill } from "../../../status-pill";

export const dynamic = "force-dynamic";

const STATUS_EXPLAINED: Record<string, string> = {
  Funded:
    "The funder has locked the USDC in the contract. It is waiting for the fulfiller to post proof, or for the deadline (if any) to pass so the funder can take a refund.",
  Fulfilled:
    "The fulfiller has posted proof. The funder can now release the funds, in one atomic transaction and optionally split across several destinations.",
  Released: "The funder released the funds. This is final, and the fulfiller's reputation was credited on-chain.",
  Refunded: "The deadline passed with no proof, so the funds went back to the funder. This is final.",
};

const STEPS = ["Funded", "Proof submitted", "Settled"] as const;

/** Derived from what actually happened: a funder may release straight from Funded, so "settled" does not imply proof was ever posted. */
function stepsReached(status: string, hasProof: boolean): [boolean, boolean, boolean] {
  return [true, hasProof, status === "Released" || status === "Refunded"];
}

/** Outside the component so the impure clock read isn't part of render. */
function describeDeadline(deadline: number | null): string {
  if (deadline === null) return "None: the funder chose no deadline, so there is no refund path.";
  const when = new Date(deadline * 1000).toUTCString();
  return Date.now() / 1000 >= deadline ? `${when} (passed)` : `${when}`;
}

function parseId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const parsed = parseId(id);
  if (parsed === null) return { title: "Mandate · Arcurrent" };
  try {
    const mandate = await getMandateById(parsed);
    if (!mandate) return { title: "Mandate not found · Arcurrent" };
    return {
      title: `Mandate #${mandate.id} · Arcurrent`,
      description: `${mandate.status} · $${formatUsdc(mandate.amountUsdc)} USDC escrowed on Arc mainnet.`,
    };
  } catch {
    return { title: `Mandate #${parsed} · Arcurrent` };
  }
}

export default async function MandatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseId(id);
  if (parsed === null) notFound();

  const network = getActiveArcNetwork();
  let mandate;
  try {
    mandate = await getMandateById(parsed);
  } catch {
    return (
      <div className="flex flex-1 flex-col">
        <Nav />
        <PageShell>
          <p className="rounded-xl border border-dashed border-warning p-6 text-center text-sm text-warning">
            Mandate data is temporarily unavailable. Try refreshing.
          </p>
        </PageShell>
      </div>
    );
  }
  if (!mandate) notFound();

  const open = ZERO_ADDRESS_PATTERN.test(mandate.fulfiller);
  const hasProof = !/^0x0+$/.test(mandate.proofHash);
  const reachedSteps = stepsReached(mandate.status, hasProof);
  const rep = mandate.fulfillerReputation;
  const contract = process.env.MANDATE_ESCROW_ADDRESS;

  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <PageShell>
        <div className="flex flex-col gap-2" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.35)" }}>
          <Link href="/dashboard" className="text-xs text-muted hover:text-foreground">
            ← Dashboard
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Mandate #{mandate.id}</h1>
            <MandateStatusPill status={mandate.status} />
          </div>
          <p className="text-sm text-foreground/80">{STATUS_EXPLAINED[mandate.status]}</p>
        </div>

        <Card>
          <ol className="grid grid-cols-3 gap-2 text-center text-xs" aria-label="Mandate progress">
            {STEPS.map((label, i) => {
              const reached = reachedSteps[i];
              const text = i === 2 && mandate.status === "Refunded" ? "Refunded" : label;
              return (
                <li
                  key={label}
                  className={`rounded-lg border px-2 py-2 font-medium ${
                    reached ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"
                  }`}
                >
                  {text}
                </li>
              );
            })}
          </ol>
        </Card>

        <Card title="Terms">
          <dl className="flex flex-col gap-3">
            <Field label="Amount">
              <span className="font-mono">${formatUsdc(mandate.amountUsdc)} USDC</span>
            </Field>
            <Field label="Funder">
              <AddressLink address={mandate.funder} />
            </Field>
            <Field label="Fulfiller">
              {open ? (
                <span className="text-muted">Open: whoever posts proof first becomes the fulfiller</span>
              ) : (
                <AddressLink address={mandate.fulfiller} />
              )}
            </Field>
            <Field label="Deadline">{describeDeadline(mandate.deadline)}</Field>
            <Field label="Proof hash">
              {hasProof ? <code className="break-all font-mono text-xs">{mandate.proofHash}</code> : <span className="text-muted">No proof submitted yet</span>}
            </Field>
            {!open && (
              <Field label="Fulfiller record">
                {rep ? (
                  <span className="font-mono text-xs">
                    {rep.completed} completed · {rep.refunded} refunded · ${formatUsdc(rep.volumeSettledUsdc)} settled
                  </span>
                ) : (
                  <span className="text-muted">No reputation yet</span>
                )}
              </Field>
            )}
          </dl>
        </Card>

        {hasProof && (
          <Card title="Verify the proof">
            <p className="text-xs text-muted">
              Only a hash of the proof lives on-chain. If a fulfiller shows you the evidence, paste it here to confirm it is exactly what they committed to. This runs in your browser.
            </p>
            <ProofVerifier onChainHash={mandate.proofHash} />
          </Card>
        )}

        {(mandate.status === "Funded" || mandate.status === "Fulfilled") && (
        <Card title="Act on this mandate">
          <p className="text-xs text-muted">
            Only the funder can release or refund, and only the fulfiller can post proof. Connect the right wallet on the dashboard and this mandate loads ready to go.
          </p>
          <Link
            href={`/dashboard?mandate=${mandate.id}`}
            className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90"
          >
            Manage mandate #{mandate.id}
          </Link>
        </Card>
        )}

        {contract && (
          <p className="text-xs text-muted">
            Read straight from the contract on {network.name}:{" "}
            <a href={`${network.blockExplorer}/address/${contract}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              MandateEscrow on the explorer ↗
            </a>{" "}
            (source verified).
          </p>
        )}
      </PageShell>
    </div>
  );
}
