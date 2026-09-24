import { describe, expect, it } from "vitest";
import { buildRequestPath, parseRequestParams, validateRequest } from "./request-link";

const TO = "0xFde19f3BCd5482544ce672391d839a56dA96BFEE";

describe("validateRequest", () => {
  it("accepts a normal request and trims the note", () => {
    const r = validateRequest({ to: TO, amount: "12.5", note: "  Logo design  ", days: "14" });
    expect(r).toEqual({ ok: true, request: { to: TO, amount: "12.5", note: "Logo design", days: "14" } });
  });

  it("rejects a malformed or zero recipient", () => {
    expect(validateRequest({ to: "0x123", amount: "1" }).ok).toBe(false);
    expect(validateRequest({ to: "0x0000000000000000000000000000000000000000", amount: "1" }).ok).toBe(false);
  });

  it("rejects zero, negative, non-numeric and over-precise amounts", () => {
    for (const amount of ["0", "-1", "abc", "1e3", "1.1234567", ""]) {
      expect(validateRequest({ to: TO, amount }).ok).toBe(false);
    }
  });

  it("accepts up to 6 decimals", () => {
    expect(validateRequest({ to: TO, amount: "0.000001" }).ok).toBe(true);
  });

  it("rejects out-of-range or fractional deadline days but allows blank", () => {
    expect(validateRequest({ to: TO, amount: "1", days: "0" }).ok).toBe(false);
    expect(validateRequest({ to: TO, amount: "1", days: "3651" }).ok).toBe(false);
    expect(validateRequest({ to: TO, amount: "1", days: "1.5" }).ok).toBe(false);
    expect(validateRequest({ to: TO, amount: "1", days: "" }).ok).toBe(true);
  });

  it("strips control characters and caps the note length", () => {
    const r = validateRequest({ to: TO, amount: "1", note: `a\nb\u0000${"x".repeat(200)}` });
    expect(r.ok && r.request.note.length).toBe(80);
    expect(r.ok && /[\u0000-\u001f]/.test(r.request.note)).toBe(false);
  });
});

describe("buildRequestPath / parseRequestParams round trip", () => {
  it("survives a URL round trip, including awkward note characters", () => {
    const path = buildRequestPath({ to: TO, amount: "5", note: "Q3 invoice & fees #2", days: "30" });
    const params = Object.fromEntries(new URL(path, "https://x.test").searchParams);
    expect(parseRequestParams(params)).toEqual({
      ok: true,
      request: { to: TO, amount: "5", note: "Q3 invoice & fees #2", days: "30" },
    });
  });

  it("omits empty optional params from the link", () => {
    expect(buildRequestPath({ to: TO, amount: "5" })).toBe(`/request?to=${TO}&amount=5`);
  });

  it("returns null when there is no request in the URL, and an error for a partial one", () => {
    expect(parseRequestParams({})).toBeNull();
    const partial = parseRequestParams({ to: TO });
    expect(partial && !partial.ok).toBe(true);
  });

  it("takes the first value when a param is repeated", () => {
    const r = parseRequestParams({ to: [TO, "0xdead"], amount: ["2", "3"] });
    expect(r && r.ok && r.request.amount).toBe("2");
  });
});
