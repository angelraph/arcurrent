"use client";

import { useState } from "react";

/**
 * A terminal command meant to be pasted, not just read. Copies the raw text
 * (no prompt glyph, no comments) so what lands in the clipboard runs as-is.
 */
export function CopyCode({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const raw = lines.filter((l) => !l.trimStart().startsWith("#")).join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the command is still fully selectable below.
    }
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto p-5 pr-20 font-mono text-[13px] leading-[1.65] text-[#e8ecf4]">
        <code>
          {lines.map((line, i) => (
            <div key={i} className={line.trimStart().startsWith("#") ? "text-[#8890a0]" : undefined}>
              {line || " "}
            </div>
          ))}
        </code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-3 top-3 rounded-[3px] border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-[#e8ecf4] transition hover:bg-white/10"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
