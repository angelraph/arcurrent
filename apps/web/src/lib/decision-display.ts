/**
 * How the agent's decisions are shown, kept apart from how they are stored.
 * Nothing here edits or hides a record: the stored rows stay exactly as the
 * agent wrote them, these helpers only decide how to label and group them.
 */

interface DecisionLike {
  obligationId: string;
  action: string;
  reasoning: string;
  createdAt: string;
}

/**
 * The agent records an evaluation that threw (a bad address, an RPC hiccup)
 * under the closest existing action, "insufficient_funds", because the
 * action column is a database enum and a new value needs a migration. Shown
 * as-is that blames the treasury for something that was not about money, so
 * the label is corrected at display time.
 */
export function displayAction(d: Pick<DecisionLike, "action" | "reasoning">): string {
  if (d.action === "insufficient_funds" && d.reasoning.startsWith("Evaluation failed")) {
    return "evaluation_error";
  }
  return d.action;
}

// Real settlements are never folded together: every payment is its own row.
const NEVER_COLLAPSE = new Set(["pay_now"]);

export type CollapsedDecision<T extends DecisionLike> = T & {
  /** How many older, identical-in-kind verdicts for the same obligation were folded into this one. */
  repeats: number;
  /** When the first of those folded verdicts was recorded. */
  since: string | null;
};

/**
 * Newest first in, newest first out. A bill the agent cannot settle yet (an
 * EURC invoice with no conversion path, say) gets re-evaluated on every pass
 * and produces a near-identical verdict each time. Folding those into one row
 * with a count keeps the log readable without discarding that it kept
 * checking.
 */
export function collapseRepeatedDecisions<T extends DecisionLike>(decisions: T[]): CollapsedDecision<T>[] {
  const out: CollapsedDecision<T>[] = [];
  const index = new Map<string, number>();

  for (const d of decisions) {
    const kind = displayAction(d);
    if (NEVER_COLLAPSE.has(kind)) {
      out.push({ ...d, repeats: 0, since: null });
      continue;
    }
    const key = `${d.obligationId}:${kind}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ ...d, repeats: 0, since: null });
    } else {
      const kept = out[at];
      kept.repeats += 1;
      kept.since = d.createdAt;
    }
  }
  return out;
}
