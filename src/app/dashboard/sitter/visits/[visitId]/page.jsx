import { formatPetCareDetails } from '@/lib/bookings/carePresentation';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/auth';
import { prisma } from '@/lib/db';
import { loadParticipantVisit, participantVisitEntry } from '@/lib/bookings/handoff/participantSurface';
import { CareInstructions, ParticipantCompletion, ParticipantVisitCard } from '../../_components/ParticipantVisit';
export default async function ParticipantVisitPage({ params }) {
  const session = await requireRole(['SITTER']);
  const { visitId } = await params;
  const dto = await loadParticipantVisit({ db: prisma, visitId, userId: session.user.id });
  if (!dto) notFound();
  if (dto.kind === 'LEAD') redirect(`/dashboard/sitter/bookings/${dto.bookingId}`);
  if (dto.unavailable) return <main className="mx-auto max-w-2xl space-y-3 p-4"><h1 className="text-xl font-bold">Visit unavailable</h1><p>This visit needs operator review before care can proceed.</p><Link href="/dashboard/sitter">Back to dashboard</Link></main>;
  const entry = participantVisitEntry(dto, dto.visits[0]);
  return <main className="mx-auto max-w-2xl space-y-5 p-4 pb-24 text-[var(--task-text)] sm:p-6 sm:pb-24">
    <Link href="/dashboard/sitter" className="underline">Back to dashboard</Link>
    <h1 className="text-2xl font-bold">Coverage visit details</h1>
    <ParticipantVisitCard entry={entry} showDetailLink={false} />
    <CareInstructions text={dto.careInstructions} />
    <section className="space-y-3 rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white p-4"><h2 className="text-lg font-bold">Access and client contact</h2>
      {dto.care.accessInstructions && <p className="whitespace-pre-wrap break-words">{dto.care.accessInstructions}</p>}
      {dto.care.locationNotes && <p className="whitespace-pre-wrap break-words">{dto.care.locationNotes}</p>}
      <p>{dto.client.name || 'Client'}{dto.client.phone ? <> · <a className="underline" href={`tel:${dto.client.phone}`}>{dto.client.phone}</a></> : ' · No phone provided'}</p>
      {formatPetCareDetails(dto.care.petDetails) && <p className="text-sm text-[var(--task-text-muted)]">{formatPetCareDetails(dto.care.petDetails)}</p>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-bold">Visit action</h2><ParticipantCompletion visit={entry.visit} /></section>
  </main>;
}
