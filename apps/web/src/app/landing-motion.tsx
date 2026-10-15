"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * Motion primitives for the landing page. Everything here degrades to the
 * final, fully visible state when the visitor prefers reduced motion or the
 * browser has no IntersectionObserver, so the page never depends on motion to
 * be readable.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True when the visitor asked for less motion, or the browser cannot observe scrolling. Server renders as false. */
function useStillness(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => !("IntersectionObserver" in window) || window.matchMedia(REDUCED_MOTION).matches,
    () => false
  );
}

/** True once the element has scrolled into view (and stays true). Always true under reduced motion. */
function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const still = useStillness();
  const [observed, setObserved] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || still) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setObserved(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, still]);
  return [ref, still || observed] as const;
}

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>(0.12);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : "translateY(20px)",
        transition: `opacity 700ms ease ${delay}ms, transform 800ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function Digit({ digit, on, delay }: { digit: number; on: boolean; delay: number }) {
  // Two full revolutions of 0-9, landing on the real digit: an odometer.
  const target = 10 + digit;
  return (
    <span aria-hidden className="relative inline-block overflow-hidden align-baseline" style={{ height: "1.12em", width: "0.62em" }}>
      <span
        className="flex flex-col"
        style={{
          transform: `translateY(${on ? -target * 1.12 : 0}em)`,
          transition: `transform 1500ms cubic-bezier(0.16, 0.8, 0.2, 1) ${delay}ms`,
        }}
      >
        {Array.from({ length: 20 }, (_, n) => (
          <span key={n} className="block text-center" style={{ height: "1.12em", lineHeight: "1.12em" }}>
            {n % 10}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * A figure that rolls into place digit by digit, like an odometer, when it
 * scrolls into view. Pass the already-formatted string ("$1,240.50", "2.5M+").
 */
export function RollingNumber({
  value,
  className = "",
  fadeDecimals = false,
}: {
  value: string;
  className?: string;
  /** Grey out everything after the decimal point, the way treasury apps de-emphasise cents. */
  fadeDecimals?: boolean;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.5);
  const dot = value.indexOf(".");
  return (
    <span ref={ref} role="img" aria-label={value} className={`inline-flex items-baseline ${className}`}>
      {value.split("").map((ch, i) => {
        const faded = fadeDecimals && dot !== -1 && i >= dot;
        const node = /\d/.test(ch) ? (
          <Digit digit={Number(ch)} on={seen} delay={i * 80} />
        ) : (
          <span aria-hidden>{ch}</span>
        );
        return (
          <span key={i} className={faded ? "opacity-40" : undefined}>
            {node}
          </span>
        );
      })}
    </span>
  );
}

/** A horizontal bar that grows to `percent` of its track when it scrolls into view. */
export function GrowBar({
  percent,
  className = "bg-accent",
  delay = 0,
}: {
  percent: number;
  className?: string;
  delay?: number;
}) {
  const [ref, seen] = useInView<HTMLDivElement>(0.5);
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div ref={ref} className="h-full w-full">
      <div
        className={`h-full rounded-full ${className}`}
        style={{
          width: `${seen ? clamped : 0}%`,
          minWidth: seen && clamped > 0 ? 6 : 0,
          transition: `width 1400ms cubic-bezier(0.16, 0.8, 0.2, 1) ${delay}ms`,
        }}
      />
    </div>
  );
}

/**
 * A "transaction status" card that walks through the real mandate lifecycle
 * on a loop: created, proof posted, released.
 */
export function StepLoop({ steps }: { steps: { title: string; sub: string }[] }) {
  const still = useStillness();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setTick((a) => (a >= steps.length + 1 ? 0 : a + 1)), 1500);
    return () => clearInterval(id);
  }, [still, steps.length]);
  // Under reduced motion the card rests on its finished state.
  const active = still ? steps.length : tick;

  return (
    <ol className="flex flex-col gap-0">
      {steps.map((s, i) => {
        const done = active > i;
        const current = active === i;
        return (
          <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-px bg-border"
              >
                <span
                  className="block w-px bg-success"
                  style={{ height: done ? "100%" : "0%", transition: "height 600ms ease" }}
                />
              </span>
            )}
            <span
              aria-hidden
              className={`relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors duration-500 ${
                done
                  ? "border-success bg-success text-white"
                  : current
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface text-muted"
              }`}
            >
              {done ? "✓" : current ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" /> : i + 1}
            </span>
            <span className="flex flex-col leading-tight">
              <span className={`text-sm font-semibold transition-colors ${done || current ? "" : "text-muted"}`}>
                {s.title}
              </span>
              <span className="text-xs text-muted">{s.sub}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface LifecycleItem {
  key: string;
  title: string;
  body: string;
  points: string[];
  stat: { label: string; value: string };
}

/**
 * Four-stage explainer that advances on its own, and stops advancing the
 * moment the visitor picks a stage themselves.
 */
export function LifecycleTabs({ items }: { items: LifecycleItem[] }) {
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  const still = useStillness();

  useEffect(() => {
    if (!seen || manual || still) return;
    const id = setTimeout(() => setActive((a) => (a + 1) % items.length), 5200);
    return () => clearTimeout(id);
  }, [active, seen, manual, still, items.length]);

  const item = items[active];
  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
      <div role="tablist" aria-label="Payment lifecycle" className="flex flex-col gap-2">
        {items.map((it, i) => {
          const on = i === active;
          return (
            <button
              key={it.key}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => {
                setManual(true);
                setActive(i);
              }}
              className={`group relative flex flex-col gap-1 overflow-hidden rounded-xl px-5 py-4 text-left transition ${
                on ? "bg-surface ring-1 ring-[var(--ring)] shadow-[0_8px_30px_rgba(0,0,0,0.08)]" : "hover:bg-surface/60"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`text-xs font-semibold ${on ? "text-accent" : "text-muted"}`}>0{i + 1}</span>
                <span className={`text-base font-semibold ${on ? "" : "text-muted group-hover:text-foreground"}`}>
                  {it.title}
                </span>
              </span>
              <span
                className="grid text-sm leading-relaxed text-muted transition-all duration-500"
                style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0 }}
              >
                <span className="overflow-hidden">{it.body}</span>
              </span>
              {on && !manual && seen && (
                <span aria-hidden className="absolute bottom-0 left-0 h-[2px] bg-accent lifecycle-progress" />
              )}
            </button>
          );
        })}
      </div>

      <div className="relative flex min-h-[320px] flex-col justify-between gap-6 overflow-hidden rounded-2xl bg-band p-7 text-band-foreground sm:p-9">
        <div aria-hidden className="hero-orb -right-10 -top-16 h-56 w-56 opacity-60" />
        <div key={item.key} className="relative flex flex-col gap-5 panel-swap">
          <p className="text-xs font-semibold text-accent">{item.title}</p>
          <ul className="flex flex-col gap-3">
            {item.points.map((p) => (
              <li key={p} className="flex gap-3 text-base leading-snug">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div key={`${item.key}-stat`} className="relative flex items-end justify-between gap-4 border-t border-band-rule pt-5 panel-swap">
          <span className="text-sm text-band-muted">{item.stat.label}</span>
          <span className="text-3xl font-semibold tracking-[-0.03em]">{item.stat.value}</span>
        </div>
      </div>
    </div>
  );
}
