"use client";

import { useMemo, useState } from "react";

const ICONS = {
  OVERNIGHT: "🏠",
  DROP_IN: "🍽️",
  WALK: "🐾",
  EXTRA: "✨",
};

function subtitleFor(option) {
  // You can refine this later with real copy per service.
  if (option.category === "OVERNIGHT") return "Overnight care";
  if (option.category === "DROP_IN") return "Quick visit in your home";
  if (option.category === "WALK") return "Walk in your neighborhood";
  return "Add-on service";
}

export default function ServicePicker({
  options = [],
  value,
  onChange,
  initialSpecies = "ALL",
}) {
  const [speciesFilter, setSpeciesFilter] = useState(initialSpecies);

  const filtered = useMemo(() => {
    if (speciesFilter === "ALL") return options;
    return options.filter((o) => o.species === speciesFilter);
  }, [options, speciesFilter]);

  const selected = useMemo(
    () => options.find((o) => o.code === value) || null,
    [options, value]
  );

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex gap-2">
        {["ALL", "DOG", "CAT"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSpeciesFilter(k)}
            className={`px-3 py-1 rounded-full border text-sm ${
              speciesFilter === k ? "bg-black text-white" : "bg-white"
            }`}
          >
            {k === "ALL" ? "All" : k === "DOG" ? "Dogs" : "Cats"}
          </button>
        ))}
      </div>

      {/* Selected summary (nice touch) */}
      {selected ? (
        <div className="text-xs text-gray-500">
          Selected:{" "}
          <span className="font-medium text-gray-700">{selected.label}</span>
        </div>
      ) : null}

      {/* Cards */}
      <div className="grid grid-cols-1 gap-2">
        {filtered.map((o) => {
          const active = o.code === value;
          const icon = ICONS[o.category] || "🐾";

          return (
            <button
              key={o.code}
              type="button"
              onClick={() => onChange(o)}
              className={`text-left w-full border rounded-xl px-3 py-3 bg-white transition
                ${
                  active
                    ? "border-black ring-2 ring-black/20"
                    : "border-gray-200 hover:border-gray-400"
                }`}
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl">{icon}</div>
                <div className="flex-1">
                  <div className="font-medium">{o.label}</div>
                  <div className="text-sm text-gray-500">
                    {subtitleFor(o)} • {o.species === "DOG" ? "Dog" : "Cat"}
                  </div>
                </div>
                <div className="text-xl">{active ? "✅" : "›"}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
