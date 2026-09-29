"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/format";

/**
 * Proof the decision loop is still alive between page loads, not just that
 * it once ran. Ticks client-side off the timestamp of the agent's own most
 * recent decision (any obligation, any action, including "wait"), so a
 * visitor can watch the number climb in real time instead of trusting a
 * cron schedule they can't see.
 */
export function AgentHeartbeat({ lastCheckedIn }: { lastCheckedIn: string | null }) {
  const [label, setLabel] = useState(() => (lastCheckedIn ? formatRelativeTime(lastCheckedIn) : null));

  useEffect(() => {
    if (!lastCheckedIn) return;
    const id = setInterval(() => setLabel(formatRelativeTime(lastCheckedIn)), 5000);
    return () => clearInterval(id);
  }, [lastCheckedIn]);

  if (!label) {
    return <p className="label-mono text-muted">Agent has not logged a decision yet.</p>;
  }

  return (
    <p className="flex items-center gap-2 label-mono text-muted">
      <span aria-hidden className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
      Agent last checked in: <span className="text-foreground">{label}</span>
    </p>
  );
}
