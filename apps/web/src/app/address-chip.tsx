"use client";

import { useState } from "react";

/** A deterministic two-tone avatar from the address, so the same wallet always looks the same. */
function avatarGradient(address: string): string {
  const n = parseInt(address.slice(2, 14), 16);
  const h1 = n % 360;
  const h2 = (h1 + 55 + ((n >> 8) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 65% 55%), hsl(${h2} 70% 40%))`;
}

/**
 * A wallet address the way treasury apps show one: a small avatar, the
 * shortened address, one-click copy, and a link to the explorer. The full
 * value is always available on hover and in the copied text.
 */
export function AddressChip({
  address,
  explorerUrl,
  label,
}: {
  address: string;
  explorerUrl?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; the address stays visible and selectable.
    }
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-elevated py-1 pl-1 pr-2 text-sm" title={address}>
      <span aria-hidden className="h-5 w-5 shrink-0 rounded-full" style={{ background: avatarGradient(address) }} />
      {label && <span className="text-muted">{label}</span>}
      <span className="font-mono text-[13px]">
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Address copied" : "Copy address"}
        className="rounded p-0.5 text-muted transition hover:text-foreground"
      >
        {copied ? (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 8.5l3.2 3L13 4.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
          </svg>
        )}
      </button>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View on explorer"
          className="rounded p-0.5 text-muted transition hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M6.5 3.5h-2A1.5 1.5 0 0 0 3 5v6.5A1.5 1.5 0 0 0 4.5 13H11a1.5 1.5 0 0 0 1.5-1.5v-2M9 3h4v4M13 3L7.5 8.5" />
          </svg>
        </a>
      )}
    </span>
  );
}
