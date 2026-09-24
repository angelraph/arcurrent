/**
 * The architecture as a payment-rail diagram: who holds which power, and where
 * the money actually moves. Drawn on faint graph paper with hairline nodes and
 * Arc-blue connectors, the way an operating sheet maps a flow, not as a
 * dashboard of tiles. A central plum node (the vault) carries the rules.
 *
 * Wide screens get the SVG; phones get the same story as a vertical chain,
 * because the SVG's labels would shrink below legible size there.
 */

const MONO = "var(--font-plex-mono), ui-monospace, monospace";
const SANS = "var(--font-inter), system-ui, sans-serif";

function Node({
  x,
  y,
  w,
  h,
  title,
  sub,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="var(--surface)" stroke="var(--rule)" />
      <text x={x + 14} y={y + 24} fontFamily={SANS} fontSize={13} fontWeight={600} fill="var(--foreground)">
        {title}
      </text>
      <text x={x + 14} y={y + 42} fontFamily={MONO} fontSize={10.5} fill="var(--muted)">
        {sub}
      </text>
    </g>
  );
}

function Chip({ x, y, w, label }: { x: number; y: number; w: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={22} rx={3} fill="none" stroke="var(--plum-foreground)" strokeOpacity={0.35} />
      <text x={x + w / 2} y={y + 15} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fill="var(--plum-foreground)">
        {label}
      </text>
    </g>
  );
}

function Label({ x, y, text, anchor = "middle" }: { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={10} fill="var(--signal)">
      {text}
    </text>
  );
}

const STEPS = [
  { title: "Owner wallet", sub: "Sets the rules, funds it, can always withdraw" },
  { title: "AgentVault", sub: "Holds the treasury. Per-payment cap, daily cap, allowlist, pause", strong: true },
  { title: "Agent (operator)", sub: "Signs one call, pay(), inside those rules. Holds gas only" },
  { title: "MandateEscrow", sub: "Creates and releases the payment in one transaction" },
  { title: "Payee", sub: "Paid, and credited on-chain reputation" },
];

export function RailDiagram() {
  return (
    <div className="relative">
      {/* Layered technical sheets behind the diagram. */}
      <div aria-hidden className="absolute inset-0 -rotate-[1.6deg] rounded-xl border border-border bg-panel" />
      <div aria-hidden className="absolute inset-0 rotate-[1deg] rounded-xl border border-border bg-surface/70" />

      <figure className="relative rounded-xl border border-border bg-surface p-4 sm:p-5">
        <figcaption className="label-mono mb-3 flex items-center justify-between">
          <span>How a payment moves</span>
          <span className="normal-case tracking-normal text-[var(--signal)]">live contracts</span>
        </figcaption>

        <svg
          viewBox="0 0 640 400"
          role="img"
          aria-label="The owner sets rules on the AgentVault. The agent's wallet can only call pay on the vault. The vault creates and releases a mandate on MandateEscrow, which pays the payee and updates on-chain reputation."
          className="hidden h-auto w-full sm:block"
        >
          <defs>
            <marker id="rail-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* connectors */}
          <g fill="none" stroke="var(--accent)" strokeWidth={1.5}>
            <path d="M170 70 H205 V190 H245" markerEnd="url(#rail-arrow)" />
            <path d="M170 330 H205 V225 H245" markerEnd="url(#rail-arrow)" strokeDasharray="5 4" />
            <path d="M395 205 H470" markerEnd="url(#rail-arrow)" />
            <path d="M545 260 V318" markerEnd="url(#rail-arrow)" />
          </g>
          <path d="M545 150 V96" fill="none" stroke="var(--rule)" strokeWidth={1.5} strokeDasharray="3 4" markerEnd="url(#rail-arrow)" />

          {/* connector labels */}
          <Label x={196} y={62} text="rules" anchor="middle" />
          <Label x={186} y={352} text="pay(to, amount)" anchor="start" />
          <Label x={432} y={196} text="1 tx" />
          <Label x={554} y={296} text="paid" anchor="start" />
          <Label x={554} y={124} text="reputation" anchor="start" />

          {/* nodes */}
          <Node x={20} y={38} w={150} h={64} title="Owner wallet" sub="you · hardware" />
          <Node x={20} y={298} w={150} h={64} title="Agent wallet" sub="operator · gas only" />
          <Node x={470} y={38} w={150} h={58} title="Reputation" sub="on-chain ledger" />
          <Node x={470} y={150} w={150} h={110} title="MandateEscrow" sub="open · verified" />
          <Node x={470} y={318} w={150} h={64} title="Payee" sub="paid atomically" />

          {/* the vault: the one dark, central tile */}
          <rect x={245} y={140} width={150} height={132} rx={6} fill="var(--plum)" />
          <text x={320} y={166} textAnchor="middle" fontFamily={SANS} fontSize={14} fontWeight={600} fill="var(--plum-foreground)">
            AgentVault
          </text>
          <text x={320} y={183} textAnchor="middle" fontFamily={MONO} fontSize={10} fill="var(--plum-foreground)" fillOpacity={0.7}>
            holds the treasury
          </text>
          <Chip x={261} y={196} w={118} label="$1 / payment" />
          <Chip x={261} y={222} w={118} label="$5 / day" />
          <Chip x={261} y={248} w={56} label="list" />
          <Chip x={323} y={248} w={56} label="pause" />
        </svg>

        {/* Phones: the same flow as a chain. */}
        <ol className="flex flex-col sm:hidden">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col items-stretch">
              <div
                className={`rounded-lg border px-3.5 py-3 ${
                  s.strong ? "border-transparent bg-plum text-plum-foreground" : "border-rule bg-surface"
                }`}
              >
                <p className="text-sm font-semibold">{s.title}</p>
                <p className={`mt-0.5 font-mono text-[11px] ${s.strong ? "opacity-70" : "text-muted"}`}>{s.sub}</p>
              </div>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="mx-auto h-4 w-px bg-accent" />
              )}
            </li>
          ))}
        </ol>
      </figure>
    </div>
  );
}
