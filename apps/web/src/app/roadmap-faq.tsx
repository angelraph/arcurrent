import Link from "next/link";
import { FAQ, ROADMAP, faqJsonLd, type RoadmapStatus } from "@/lib/content";
import { Section, SectionHeader } from "./landing-sections";

const STATUS_STYLE: Record<RoadmapStatus, { badge: string; marker: string }> = {
  shipped: { badge: "bg-success-soft text-success", marker: "bg-success" },
  next: { badge: "bg-accent-soft text-accent", marker: "bg-accent" },
  later: { badge: "bg-border text-muted", marker: "bg-muted" },
};

export function Roadmap() {
  return (
    <Section id="roadmap">
      <SectionHeader
        eyebrow="Roadmap"
        title="From a working build to something you can rely on."
        intro="What is live today, what comes next, and what has to happen before it holds real volume. Shipped is built and running. The rest is direction, not a promise."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {ROADMAP.map((column) => {
          const style = STATUS_STYLE[column.status];
          return (
            <section
              key={column.status}
              aria-labelledby={`roadmap-${column.status}`}
              className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-6"
            >
              <div className="flex flex-col gap-3">
                <span className={`label-mono w-fit rounded-[3px] px-2 py-1 ${style.badge}`}>{column.label}</span>
                <h3
                  id={`roadmap-${column.status}`}
                  className="font-display text-xl font-medium leading-snug tracking-[-0.02em]"
                >
                  {column.title}
                </h3>
              </div>
              <ul className="flex flex-col gap-3.5 border-t border-border pt-5">
                {column.items.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted">
                    <span aria-hidden className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-[1px] ${style.marker}`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Section>
  );
}

export function Faq() {
  return (
    <Section id="faq" tinted>
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.4fr] lg:gap-16">
        <div className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
          <SectionHeader eyebrow="FAQ" title="Questions, answered plainly." />
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            Something not covered here? Every claim on this site can be checked against the contracts on Arc&apos;s
            explorer, or in the{" "}
            <a
              href="https://github.com/angelraph/arcurrent"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent hover:underline"
            >
              source
            </a>
            .
          </p>
          <Link href="/dashboard" className="btn btn-outline w-fit">
            See it working
          </Link>
        </div>

        <div className="border-t border-border">
          {FAQ.map((item) => (
            <details key={item.id} id={item.id} className="faq-item border-b border-border">
              <summary className="flex items-center justify-between gap-6 py-5 text-left">
                <span className="font-display text-lg font-medium leading-snug tracking-[-0.015em]">{item.q}</span>
                <span
                  aria-hidden
                  className="faq-plus flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-border font-mono text-base leading-none text-muted"
                >
                  +
                </span>
              </summary>
              <div className="flex max-w-2xl flex-col gap-3 pb-6 pr-10 text-sm leading-relaxed text-muted sm:text-[15px]">
                {item.a.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      <script
        type="application/ld+json"
        // Built from the same FAQ array the page renders, so the two cannot disagree.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)).replace(/</g, "\\u003c") }}
      />
    </Section>
  );
}
