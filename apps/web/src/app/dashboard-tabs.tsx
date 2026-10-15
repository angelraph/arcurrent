"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface DashboardTab {
  key: string;
  label: string;
  /** A small count shown next to the label, e.g. how many rows are inside. */
  count?: number;
  content: ReactNode;
}

/** Plain stroke icons, one per section, so the sidebar scans the way an app's does. */
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    overview: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
    vault: "M4 7h16v12H4zM4 7l2-3h12l2 3M12 11v4M10 13h4",
    obligations: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
    mandates: "M4 12h6M14 12h6M10 8l4 4-4 4",
    log: "M4 5h16M4 12h16M4 19h10",
    "use-it": "M13 3 4 14h7l-1 7 9-11h-7z",
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name] ?? paths.overview} />
    </svg>
  );
}

/**
 * Page navigation as a left sidebar on wide screens and a scrolling strip on
 * narrow ones: the shape of a treasury app, instead of one long scroll. The
 * panels are rendered on the server and passed in, so switching is instant and
 * nothing is fetched again. The active section follows the URL hash, so a link
 * can open straight onto one.
 */
export function DashboardTabs({
  tabs,
  initial,
  footer,
}: {
  tabs: DashboardTab[];
  initial: string;
  footer?: ReactNode;
}) {
  const [active, setActive] = useState(initial);

  useEffect(() => {
    const keys = tabs.map((t) => t.key);
    function fromHash() {
      const key = window.location.hash.replace("#", "");
      if (key && keys.includes(key)) setActive(key);
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  function select(key: string) {
    setActive(key);
    try {
      history.replaceState(null, "", `#${key}`);
    } catch {
      // Hash updates are a convenience, never required.
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="Dashboard sections" className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
        <div
          role="tablist"
          aria-orientation="vertical"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
        >
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                role="tab"
                type="button"
                id={`tab-${t.key}`}
                aria-selected={on}
                aria-controls={`panel-${t.key}`}
                onClick={() => select(t.key)}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium transition ${
                  on ? "bg-accent-soft text-accent" : "text-muted hover:bg-elevated hover:text-foreground"
                }`}
              >
                <Icon name={t.key} />
                <span className="flex-1 whitespace-nowrap">{t.label}</span>
                {t.count !== undefined && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${on ? "bg-accent/15" : "bg-elevated"}`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {footer && <div className="hidden lg:block">{footer}</div>}
      </nav>

      <div className="min-w-0">
        {tabs.map((t) => (
          <div
            key={t.key}
            role="tabpanel"
            id={`panel-${t.key}`}
            aria-labelledby={`tab-${t.key}`}
            hidden={t.key !== active}
            className={t.key === active ? "panel-swap" : undefined}
          >
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
