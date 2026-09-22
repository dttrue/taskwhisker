import Link from "next/link";
import { businessWallTime, formatBusinessDate, BUSINESS_TIME_ZONE } from "@/lib/calendar/businessTime";
import { calendarHref } from "@/lib/calendar/calendarRange";

const statuses = [
  ["PENDING", "P", "Pending"], ["CONFIRMED", "C", "Confirmed"],
  ["COMPLETED", "D", "Completed"], ["CANCELED", "X", "Canceled"],
];
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayLabel = (date) => formatBusinessDate(businessWallTime(date, "00:00"));

// Authorized counts and navigation context only. No tenant or booking lookups.
export default function MonthCalendar({ range, days, basePath }) {
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  return <section aria-label={`${range.label} calendar`} className="space-y-3">
    <h2 className="text-xl font-bold">{range.label}</h2>
    <p className="text-sm text-[var(--task-text-muted)]">Choose a date to open its Day agenda. Visit counts do not indicate availability.</p>
    <p className="text-sm">{range.selectedDate ? <>Selected: <strong>{dayLabel(range.selectedDate)}</strong></> : "No date selected."}</p>
    <ul aria-label="Visit status legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--task-text-muted)]">
      {statuses.map(([status, short, label]) => <li key={status}><strong>{short}</strong> {label}</li>)}
      <li><strong>↳</strong> Continues from a previous day</li>
    </ul>
    {!days.some((day) => day.total > 0) && <p className="rounded-lg bg-[var(--task-surface-soft)] p-3 text-sm">No visits scheduled in this calendar range.</p>}
    {/* Native table + date links provide weekday relationships and Tab/Enter
        navigation without claiming an ARIA grid's arrow-key interaction model. */}
    <table className="w-full table-fixed border-collapse text-center">
      <caption className="sr-only">{range.label}. Each date opens its Day agenda.</caption>
      <thead><tr>{weekdays.map((day) => <th key={day} scope="col" className="pb-2 text-xs font-semibold"><abbr className="no-underline" title={day}>{day.slice(0, 3)}</abbr></th>)}</tr></thead>
      <tbody>{weeks.map((week) => <tr key={week[0].date}>{week.map((day) => {
        const current = day.date === range.today, selected = day.date === range.selectedDate;
        const adjacent = !day.date.startsWith(range.month);
        const details = statuses.filter(([status]) => day.counts[status]).map(([status, , label]) => `${day.counts[status]} ${label.toLowerCase()}`);
        const label = [dayLabel(day.date), current && "Today", selected && "Selected", `${day.total} ${day.total === 1 ? "visit" : "visits"}`, ...details,
          day.continuing > 0 && `${day.continuing} continuing from a previous day`, "Open Day agenda"].filter(Boolean).join(". ");
        return <td key={day.date} className={`border border-[var(--task-border)] p-0 align-top ${adjacent ? "bg-[var(--task-surface-soft)]" : "bg-[var(--task-surface)]"}`}>
          <Link href={calendarHref(basePath, "today", day.date)} aria-label={label} aria-current={current ? "date" : undefined}
            data-selected={selected || undefined}
            className={`relative flex min-h-28 min-w-0 flex-col items-center gap-0.5 px-0.5 py-1.5 text-xs hover:bg-[var(--task-surface-soft)] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--task-focus)] ${selected ? "shadow-[inset_0_0_0_2px_var(--task-primary)]" : ""}`}>
            <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${selected ? "bg-[var(--task-primary)] text-white" : ""}`}>{Number(day.date.slice(-2))}</span>
            <span aria-hidden="true" className={`h-4 text-[10px] font-bold ${current ? "text-[var(--task-primary)] underline decoration-2 underline-offset-2" : ""}`}>{current ? "Today" : adjacent ? new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, month: "short" }).format(businessWallTime(day.date, "00:00")) : ""}</span>
            <span aria-hidden="true" className="flex flex-col items-center leading-4">
              {statuses.filter(([status]) => day.counts[status]).map(([status, short]) => <span key={status} className="whitespace-nowrap">{short} {day.counts[status] > 99 ? "99+" : day.counts[status]}</span>)}
              {day.continuing > 0 && <span>↳</span>}
            </span>
          </Link>
        </td>;
      })}</tr>)}</tbody>
    </table>
  </section>;
}
