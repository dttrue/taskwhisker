// src/app/dashboard/operator/_components/DateRangeFilter.jsx

export default function DateRangeFilter({ from, to }) {
  return (
    <form method="GET" className="flex flex-col sm:flex-row sm:items-end gap-3">
      {/* Date Inputs */}
      <div className="flex gap-3 flex-1">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-zinc-500">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from || ""}
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm
                       focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900
                       transition"
          />
        </div>

        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-zinc-500">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to || ""}
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm
                       focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900
                       transition"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white
                     hover:bg-zinc-800 transition"
        >
          Apply
        </button>

        <a
          href="/dashboard/operator"
          className="h-10 inline-flex items-center rounded-md border border-zinc-200 px-4
                     text-sm font-medium text-zinc-700 hover:border-zinc-300 transition"
        >
          Reset
        </a>
      </div>
    </form>
  );
}
