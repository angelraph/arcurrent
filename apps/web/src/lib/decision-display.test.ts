import { describe, expect, it } from "vitest";
import { collapseRepeatedDecisions, displayAction } from "./decision-display";

const d = (over: Partial<Parameters<typeof collapseRepeatedDecisions>[0][number]>) => ({
  obligationId: "o1",
  action: "convert_currency",
  reasoning: "rate 1.14",
  createdAt: "2026-09-28T06:00:00Z",
  ...over,
});

describe("displayAction", () => {
  it("relabels a thrown evaluation that was stored as insufficient_funds", () => {
    expect(displayAction({ action: "insufficient_funds", reasoning: 'Evaluation failed (attempted: pay_now): Address "0x" is invalid.' })).toBe("evaluation_error");
  });

  it("leaves a genuine empty-treasury verdict alone", () => {
    expect(displayAction({ action: "insufficient_funds", reasoning: "Balance $0.00 does not cover $5.00." })).toBe("insufficient_funds");
  });

  it("leaves every other action alone", () => {
    expect(displayAction({ action: "pay_now", reasoning: "Evaluation failed" })).toBe("pay_now");
  });
});

describe("collapseRepeatedDecisions", () => {
  it("folds repeated verdicts for one obligation into the newest, with a count and a start", () => {
    const rows = [
      d({ createdAt: "2026-09-28T06:00:00Z" }),
      d({ createdAt: "2026-09-27T06:00:00Z" }),
      d({ createdAt: "2026-09-26T06:00:00Z" }),
    ];
    const out = collapseRepeatedDecisions(rows);
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toBe("2026-09-28T06:00:00Z");
    expect(out[0].repeats).toBe(2);
    expect(out[0].since).toBe("2026-09-26T06:00:00Z");
  });

  it("keeps different obligations and different actions apart", () => {
    const out = collapseRepeatedDecisions([
      d({ obligationId: "o1" }),
      d({ obligationId: "o2" }),
      d({ obligationId: "o1", action: "wait" }),
    ]);
    expect(out).toHaveLength(3);
  });

  it("never folds payments together", () => {
    const out = collapseRepeatedDecisions([
      d({ action: "pay_now", createdAt: "2026-09-28T00:00:00Z" }),
      d({ action: "pay_now", createdAt: "2026-09-27T00:00:00Z" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.repeats === 0)).toBe(true);
  });
});
