import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arcurrent — Pitch Deck",
  description: "Build on Arc, Checkpoint 3 — the real, on-chain proof behind Arcurrent.",
};

/**
 * Own root layout, deliberately not the site's — the deck's typography and
 * palette (mono display + serif body, copper/signal tokens) would otherwise
 * fight globals.css and the Geist fonts loaded by (site)/layout.tsx. Next.js
 * supports multiple root layouts via sibling route groups; this is that.
 */
export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
