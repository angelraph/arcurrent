"use client";

import { useState } from "react";

/**
 * Shows a wallet address in a selectable mono block with a one-click copy
 * button, so pasting it into Circle's faucet form (which doesn't support
 * pre-filling via URL params, confirmed) is a two-second copy/paste instead
 * of digging the address out of .env.
 */
export function CopyAddress({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, non-HTTPS context, older
      // browsers) -- the address is still shown and selectable, so this
      // fails soft instead of leaving the button looking broken.
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
          {address}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-surface"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
