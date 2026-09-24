"use client";

import { useState } from "react";
import { keccak256, stringToHex } from "viem";

/**
 * Recomputes the hash the same way the dashboard's "Submit proof" does
 * (keccak256 of the trimmed text) and compares it with what's on-chain, so
 * anyone can check that a piece of evidence is exactly what a fulfiller
 * committed to -- entirely in the browser, nothing sent anywhere.
 */
export function ProofVerifier({ onChainHash }: { onChainHash: string }) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const computed = trimmed ? keccak256(stringToHex(trimmed)) : null;
  const matches = computed !== null && computed.toLowerCase() === onChainHash.toLowerCase();

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-muted">
        Paste the proof text (a URL, a description, an IPFS CID) to check it against the on-chain hash
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. https://…"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      {computed && (
        <p className={`text-xs ${matches ? "text-success" : "text-danger"}`}>
          {matches ? "Match: this is exactly what the fulfiller committed to." : "No match: this text does not hash to the on-chain proof."}
        </p>
      )}
    </div>
  );
}
