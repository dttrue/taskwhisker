import Link from 'next/link';
import { requireRole } from '@/auth';
import { prisma } from '@/lib/db';
import { coverageInboxWithDb } from '@/lib/messaging/coverage';
import CoverageInbox from '@/components/messaging/CoverageInbox';
export const dynamic = 'force-dynamic';
export default async function OperatorMessages() {
  const session = await requireRole(['OPERATOR']);
  const threads = await coverageInboxWithDb({ db: prisma, actorId: session.user.id });
  const historical = await prisma.conversation.findMany({ where: { scope: 'BOOKING' }, select: { id: true, bookingId: true, booking: { select: { petNames: true, client: { select: { name: true } } } } }, orderBy: { updatedAt: 'desc' } });
  return <main className="mx-auto max-w-4xl space-y-7 p-4 py-6 sm:p-6"><header><h1 className="text-2xl font-bold">Messages</h1><p className="mt-2 text-sm text-zinc-600">Visit coverage and historical booking conversations.</p></header><CoverageInbox threads={threads} operator/><section className="space-y-3"><h2 className="text-lg font-semibold">Booking conversations</h2>{!historical.length && <p className="text-sm">No booking conversations.</p>}{historical.map(t => <Link key={t.id} href={`/dashboard/messages/${t.bookingId}`} className="block rounded-xl border bg-white p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">Booking conversation</p><p className="mt-1 font-semibold">{t.booking.petNames.join(', ') || t.booking.client.name || 'Booking'}</p></Link>)}</section></main>;
}
