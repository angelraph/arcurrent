"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/faq", label: "FAQ" },
  { href: "/deck", label: "Pitch deck" },
];

/** The primary navigation, with the current page marked so people know where they are. */
export function NavLinks({ faucet }: { faucet: boolean }) {
  const pathname = usePathname();
  const links = faucet ? [...LINKS, { href: "/faucet", label: "Testnet faucet" }] : LINKS;

  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-x-1">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-[72px] items-center px-3 text-sm font-medium transition-colors ${
              active ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {l.label}
            {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}
