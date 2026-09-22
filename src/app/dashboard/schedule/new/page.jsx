import { requireAuth } from "@/auth";
import { prisma } from "@/lib/db";
import { manualOptions } from "@/lib/schedule/manualBooking";
import { agendaRange } from "@/lib/schedule/agenda";
import { Button, Notice, PageHeader, PageShell } from "@/components/ui/Foundation";
import ManualBookingForm from "./ManualBookingForm";

export const dynamic = "force-dynamic";

export default async function NewScheduleBookingPage({ searchParams }) {
  const session = await requireAuth();
  let options;
  try { options = await manualOptions(prisma, session.user.id); }
  catch (error) {
    if (!error.code?.startsWith("OWNER_") && error.code !== "NOT_AUTHORIZED") throw error;
    return <PageShell><PageHeader title="Booking entry unavailable" /><Notice className="mt-6">{error.message}</Notice><Button href="/dashboard" className="mt-4">Back to dashboard</Button></PageShell>;
  }
  const { date } = agendaRange(await searchParams);
  return <PageShell containerClassName="max-w-2xl">
    <Button variant="quiet" href="/dashboard/schedule">Back to schedule</Button>
    <PageHeader className="my-4" title="Add Booking" description={`Assigned to ${options.sitterName}. All dates and times are New Jersey time.`} />
    <ManualBookingForm {...options} initialDate={date} />
  </PageShell>;
}
