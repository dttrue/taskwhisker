// src/app/dashboard/operator/_components/DateRangeFilter.jsx

export default function DateRangeFilter({ from, to, review = "all" }) {
  return (
    <form
      method="GET"
      className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(145px,170px))_minmax(130px,150px)_auto] lg:items-end"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="booking-filter-from" className="text-xs font-semibold text-[var(--task-text-muted)]">
          From
        </label>
        <input
          id="booking-filter-from"
          type="date"
          name="from"
          defaultValue={from || ""}
          className="min-h-11 min-w-0 w-full rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 text-sm text-[var(--task-text)] shadow-sm"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="booking-filter-to" className="text-xs font-semibold text-[var(--task-text-muted)]">
          To
        </label>
        <input
          id="booking-filter-to"
          type="date"
          name="to"
          defaultValue={to || ""}
          className="min-h-11 min-w-0 w-full rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 text-sm text-[var(--task-text)] shadow-sm"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="booking-filter-review" className="text-xs font-semibold text-[var(--task-text-muted)]">
          Review
        </label>
        <select
          id="booking-filter-review"
          name="review"
          defaultValue={review || "all"}
          className="min-h-11 w-full min-w-0 rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 text-sm text-[var(--task-text)] shadow-sm"
        >
          <option value="all">All</option>
          <option value="needs-review">Needs review</option>
        </select>
      </div>

      <div className="flex gap-2 sm:justify-end">
        <button
          type="submit"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--task-radius-control)] bg-[var(--task-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--task-primary-hover)] sm:flex-none"
        >
          Apply
        </button>

        <a
          href="/dashboard/operator"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-4 text-sm font-semibold text-[var(--task-text)] hover:bg-[var(--task-surface-soft)] sm:flex-none"
        >
          Reset
        </a>
      </div>
    </form>
  );
}
