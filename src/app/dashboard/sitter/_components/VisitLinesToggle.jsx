// src/app/dashboard/sitter/_components/VisitLinesToggle.jsx    
"use client";

import { useState } from "react";

export default function VisitLinesToggle({
  initialLines = [],
  extraLines = [],
  labelCollapsed,
  labelExpanded,
}) {
  const [open, setOpen] = useState(false);

  const hasExtra = extraLines.length > 0;

  const collapsedLabel =
    labelCollapsed ||
    `Show ${extraLines.length} more visit${extraLines.length === 1 ? "" : "s"}`;

  const expandedLabel = labelExpanded || "Hide visits";

  return (
    <div className="mt-3 space-y-1.5">
      {/* Primary lines (today / first upcoming) */}
      {initialLines.map((line, index) => (
        <div
          key={`initial-${index}`}
          className="flex items-center gap-2 text-xs text-zinc-700"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              index === 0 && !open ? "bg-blue-500 animate-pulse" : "bg-zinc-400"
            }`}
          />
          {line}
        </div>
      ))}

      {/* Extra lines (future / hidden) */}
      {open &&
        extraLines.map((line, index) => (
          <div
            key={`extra-${index}`}
            className="flex items-center gap-2 text-xs text-zinc-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            {line}
          </div>
        ))}

      {/* Toggle */}
      {hasExtra ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          {open ? (
            <>
              {expandedLabel} <span>↑</span>
            </>
          ) : (
            <>
              {collapsedLabel} <span>↓</span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}