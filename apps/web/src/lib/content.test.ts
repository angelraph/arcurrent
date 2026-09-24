import { describe, expect, it } from "vitest";
import { FAQ, ROADMAP, faqJsonLd } from "./content";

const allText = [
  ...FAQ.flatMap((f) => [f.q, ...f.a]),
  ...ROADMAP.flatMap((c) => [c.label, c.title, ...c.items]),
];

describe("FAQ", () => {
  it("has unique, url-safe ids and a real question and answer each", () => {
    const ids = FAQ.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of FAQ) {
      expect(item.id).toMatch(/^[a-z0-9-]+$/);
      expect(item.q.trim().endsWith("?")).toBe(true);
      expect(item.a.length).toBeGreaterThan(0);
      for (const paragraph of item.a) expect(paragraph.trim().length).toBeGreaterThan(40);
    }
  });

  it("builds FAQPage structured data from the same words", () => {
    const ld = faqJsonLd(FAQ) as { "@type": string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(FAQ.length);
    expect(ld.mainEntity[0].name).toBe(FAQ[0].q);
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe(FAQ[0].a.join(" "));
  });
});

describe("Roadmap", () => {
  it("has the three statuses once each, in order, with items", () => {
    expect(ROADMAP.map((c) => c.status)).toEqual(["shipped", "next", "later"]);
    for (const column of ROADMAP) expect(column.items.length).toBeGreaterThanOrEqual(3);
  });
});

describe("house style", () => {
  it("uses no em dashes or double hyphens as punctuation in any copy", () => {
    for (const text of allText) {
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/ -- /);
    }
  });

  it("never claims a professional audit as done", () => {
    const claims = allText.filter((t) => /audited|audit /i.test(t));
    for (const t of claims) expect(t).toMatch(/not (professionally )?audited|no\.|independent|before either|not on npm|Is it audited/i);
  });
});
