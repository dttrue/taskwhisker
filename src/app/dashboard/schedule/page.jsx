import { requireAuth } from "@/auth";
import { prisma } from "@/lib/db";
import { loadAgenda } from "@/lib/schedule/agenda";
import { Button, Notice, PageHeader, PageShell } from "@/components/ui/Foundation";
import ScheduleCalendar from "@/components/calendar/ScheduleCalendar";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }) {
  const session = await requireAuth();
  let data;
  try { data = await loadAgenda(prisma, session.user.id, await searchParams); }
  catch (error) {
    if (!error.code?.startsWith("OWNER_") && error.code !== "NOT_AUTHORIZED") throw error;
    return <PageShell><PageHeader title="Schedule unavailable" /><Notice className="mt-6">{error.message}</Notice><Button className="mt-4" href="/dashboard">Back to dashboard</Button></PageShell>;
  }
  return <ScheduleCalendar range={data.range} visits={data.visits} monthDays={data.monthDays} title="Bridget’s schedule"
    description="All times are New Jersey time (America/New_York)."
    basePath="/dashboard/schedule" backHref={`/dashboard/${data.access.role.toLowerCase()}`}
    addHref={`/dashboard/schedule/new?date=${data.range.date}`} />;
}
