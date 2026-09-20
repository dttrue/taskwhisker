import { businessWallTime, addCalendarDays, formatBusinessDate, formatBusinessTime } from "@/lib/calendar/businessTime";
import { calendarHref } from "@/lib/calendar/calendarRange";
import { Button, Card, PageHeader, PageShell, StatusBadge } from "@/components/ui/Foundation";
import MonthCalendar from "./MonthCalendar";

export default function ScheduleCalendar({ range, visits = [], monthDays = [], title, description, backHref, addHref, basePath }) {
  const url = (view, date) => calendarHref(basePath, view, date);
  const unit = range.view === "today" ? "day" : range.view;
  return <PageShell containerClassName={range.view === "month" ? "max-w-5xl" : "max-w-3xl"}>
    <Button variant="quiet" href={backHref}>Back to dashboard</Button>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
      <PageHeader title={title} description={description} />
      <Button href={addHref}>Add Booking</Button>
    </div>
    <nav aria-label="Schedule dates" className="my-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        {[["month", "Month"], ["week", "Week"], ["today", "Day"]].map(([view, label]) =>
          <Button key={view} variant={range.view === view ? "primary" : "secondary"} aria-current={range.view === view ? "page" : undefined} href={url(view, range.date)}>{label}</Button>)}
        <Button variant="secondary" href={url(range.view, range.today)}>Today</Button>
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="secondary" href={url(range.view, range.previous)} aria-label={`Previous ${unit}`}>Previous</Button>
        <Button variant="secondary" href={url(range.view, range.next)} aria-label={`Next ${unit}`}>Next</Button>
      </div>
    </nav>
    {range.view === "month" ? <MonthCalendar range={range} days={monthDays} basePath={basePath} /> :
    <div className="space-y-6">{range.days.map((day) => {
      const start = businessWallTime(day, "00:00"), end = businessWallTime(addCalendarDays(day, 1), "00:00");
      const dayVisits = visits.filter((visit) => visit.startTime < end && visit.endTime > start);
      const isToday = range.view === "week" && day === range.today;
      return <section key={day} aria-labelledby={`day-${day}`} aria-current={isToday ? "date" : undefined}
        className={isToday ? "border-l-4 border-[var(--task-primary)] pl-3" : undefined}>
        <h2 id={`day-${day}`} className="mb-3 flex flex-wrap items-center gap-2 text-lg font-bold">
          {formatBusinessDate(start)}
          {isToday && <span className="rounded-full bg-[var(--task-surface-soft)] px-2.5 py-1 text-sm font-semibold text-[var(--task-primary)]">Today</span>}
        </h2>
        <div className="space-y-3">{dayVisits.length ? dayVisits.map((visit) => {
          const pets = visit.booking.bookingPets.length ? visit.booking.bookingPets.map((pet) => pet.nameSnapshot) : visit.booking.petNames;
          const acrossDays = visit.startTime < start || visit.endTime >= end;
          return <Card key={visit.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-bold break-words">{visit.booking.client.name}</h3><StatusBadge>{visit.status.toLowerCase()}</StatusBadge></div>
            <p className="font-semibold">{visit.booking.serviceSummary || visit.booking.service?.name || "Pet care"}</p>
            <p>{acrossDays ? `${formatBusinessDate(visit.startTime)} ` : ""}{formatBusinessTime(visit.startTime)} – {acrossDays ? `${formatBusinessDate(visit.endTime)} ` : ""}{formatBusinessTime(visit.endTime)}</p>
            {pets?.length > 0 && <p className="break-words">Pets: {pets.join(", ")}</p>}
            <p className="text-sm text-[var(--task-text-muted)]">Sitter: {visit.sitter?.name || "Assigned sitter"}</p>
          </Card>;
        }) : <Card className="p-4 text-[var(--task-text-muted)]">No visits scheduled.</Card>}</div>
      </section>;
    })}</div>}
  </PageShell>;
}
