"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { buildRequestPath, MAX_NOTE_LENGTH, validateRequest, type PaymentRequest } from "@/lib/request-link";
import { AccountBar, ConnectGate, CreateMandateForm } from "./wallet-mandate-panel";

const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function RequestGenerator() {
  const { address } = useAccount();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCopied(false);
    const result = validateRequest({ to, amount, note, days });
    if (!result.ok) {
      setError(result.error);
      setLink(null);
      return;
    }
    setError(null);
    setLink(`${window.location.origin}${buildRequestPath(result.request)}`);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the link is still shown and selectable below.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <label className="text-sm font-medium">
        Your address (where the payment is sent when the payer releases it)
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" required className={`${inputClass} font-mono`} />
        {address && to.toLowerCase() !== address.toLowerCase() && (
          <button type="button" onClick={() => setTo(address)} className="mt-1 text-xs text-accent underline">
            Use my connected wallet
          </button>
        )}
      </label>
      <label className="text-sm font-medium">
        Amount (USDC)
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.000001" min="0" required className={`${inputClass} font-mono`} />
      </label>
      <label className="text-sm font-medium">
        What is it for? <span className="font-normal text-muted">(optional, shown to the payer, not stored on-chain)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE_LENGTH} placeholder="e.g. Logo design, invoice #12" className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Payer can refund after <span className="font-normal text-muted">(days, optional; blank means no refund path)</span>
        <input value={days} onChange={(e) => setDays(e.target.value)} type="number" min="1" step="1" className={`${inputClass} font-mono`} />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
      >
        Create request link
      </button>
      {link && (
        <div className="flex flex-col gap-2 rounded-lg bg-background p-3">
          <code className="select-all break-all font-mono text-xs">{link}</code>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={copy} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-background">
              {copied ? "Copied" : "Copy link"}
            </button>
            <a href={link} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
              Preview what the payer sees
            </a>
          </div>
          <p className="text-xs text-muted">
            Send this to whoever should pay you. They lock the USDC in escrow, you post proof of the work on the mandate page, and they release it to you.
          </p>
        </div>
      )}
    </form>
  );
}

export function FundRequest({ request }: { request: PaymentRequest }) {
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyMandateLink() {
    if (createdId === null) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/mandate/${createdId}`);
      setCopied(true);
    } catch {
      // Blocked clipboard: the link is also shown as a normal link below.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-xl border-2 border-accent bg-surface p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Payment request</h2>
        <p className="text-2xl font-semibold tracking-tight">
          <span className="font-mono">${request.amount}</span> USDC
        </p>
        {request.note && <p className="text-sm">&ldquo;{request.note}&rdquo;</p>}
        <p className="text-xs text-muted">
          For{" "}
          <Link href={`/address/${request.to}`} className="break-all font-mono text-accent hover:underline">
            {request.to}
          </Link>
        </p>
        <p className="text-xs text-muted">
          {request.days ? `You can take a refund after ${request.days} day(s) if no proof arrives.` : "No refund deadline was set."} Funding does not pay this address: the USDC is locked in escrow and only you can release it, after they post proof. Check the address above before you sign.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Fund it from your wallet</h2>
        <ConnectGate>
          <div className="flex flex-col gap-3">
            <AccountBar />
            <CreateMandateForm
              onCreated={setCreatedId}
              preset={{ fulfiller: request.to, amount: request.amount, deadlineDays: request.days }}
            />
          </div>
        </ConnectGate>
      </section>

      {createdId !== null && (
        <section className="flex flex-col gap-2 rounded-xl border border-success bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-success">Funded: mandate #{createdId.toString()}</h2>
          <p className="text-xs text-muted">
            Send the recipient this link so they can post proof of the work. When you are satisfied, release it from the same page.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/mandate/${createdId}`} className="text-sm text-accent underline">
              Open mandate #{createdId.toString()}
            </Link>
            <button type="button" onClick={copyMandateLink} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-background">
              {copied ? "Copied" : "Copy link for the recipient"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
