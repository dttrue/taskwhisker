// src/components/ui/EmptyStateMascot.jsx
"use client";

export default function EmptyStateMascot({
  title = "Nothing scheduled yet",
  subtitle = "You’re clear for now.",
  icon = "🐾",
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center">
      <div className="text-5xl">{icon}</div>
      <h3 className="mt-3 text-base font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
    </div>
  );
}
