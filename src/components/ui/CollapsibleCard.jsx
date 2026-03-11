// src/components/ui/CollapsibleCard.jsx
"use client";

import { useState } from "react";

export default function CollapsibleCard({
  title,
  children,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left font-medium text-zinc-900 hover:bg-zinc-50 transition"
      >
        <div className="flex items-center gap-2">{title}</div>

        <span
          className={`text-zinc-300 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          className={`border-t border-zinc-200 transition-all duration-200 overflow-hidden ${
            open ? "max-h-[1000px] py-4 px-4" : "max-h-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
