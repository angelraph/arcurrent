import { describe, expect, it } from "vitest";
import { wasClaimed } from "./evaluate.js";

describe("wasClaimed", () => {
  it("is false when the conditional update matched no rows (already claimed elsewhere)", () => {
    expect(wasClaimed([])).toBe(false);
  });

  it("is false when Supabase returns null (e.g. the query itself errored before this check runs)", () => {
    expect(wasClaimed(null)).toBe(false);
  });

  it("is true when the conditional update matched exactly this obligation", () => {
    expect(wasClaimed([{ id: "obligation-1" }])).toBe(true);
  });
});
