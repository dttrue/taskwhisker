// src/app/dashboard/operator/_components/DateRangeFilter.jsx

export default function DateRangeFilter({ from, to }) {
  return (
    <form className="flex flex-wrap items-end gap-2" method="GET">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">From</label>
        <input
          type="date"
          name="from"
          defaultValue={from || ""}
          className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">To</label>
        <input
          type="date"
          name="to"
          defaultValue={to || ""}
          className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm"
        />
      </div>

      <button
        type="submit"
        className="h-9 rounded-md border border-zinc-900 px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-900 hover:text-white transition"
      >
        Apply
      </button>

      <a
        href="/dashboard/operator"
        className="h-9 inline-flex items-center rounded-md border border-zinc-200 px-3 text-sm text-zinc-700 hover:border-zinc-300 transition"
      >
        Reset
      </a>
    </form>
  );
}
