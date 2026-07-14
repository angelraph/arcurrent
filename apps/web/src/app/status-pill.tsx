const OBLIGATION_STYLES: Record<string, string> = {
  pending: "bg-warning-soft text-warning",
  scheduled: "bg-accent-soft text-accent",
  settled: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
};

const DECISION_STYLES: Record<string, string> = {
  pay_now: "bg-success-soft text-success",
  wait: "bg-accent-soft text-accent",
  convert_currency: "bg-warning-soft text-warning",
  request_liquidity: "bg-warning-soft text-warning",
  insufficient_funds: "bg-danger-soft text-danger",
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide ${className}`}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <Pill label={status} className={OBLIGATION_STYLES[status] ?? "bg-border text-muted"} />;
}

export function DecisionPill({ action }: { action: string }) {
  return <Pill label={action} className={DECISION_STYLES[action] ?? "bg-border text-muted"} />;
}
