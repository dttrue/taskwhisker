'use client';
import { formatCareServiceLabel, formatCareVisitStart } from '@/lib/bookings/carePresentation';
import { formatBookingPetNames } from '@/lib/bookings/formatPetNames';
import { StatusBadge } from '@/components/ui/Foundation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { completeVisitAsSitter } from '../actions';
import { formatFinancialCents } from '@/lib/bookings/economics/bookingEconomics';

export function CareInstructions({ text }) {
  return <section className="rounded-xl border border-[var(--task-border)] bg-white p-4">
    <h2 className="text-lg font-bold">Care instructions</h2>
    <p className="mt-2 whitespace-pre-wrap break-words leading-7">{text || 'No additional care instructions provided.'}</p>
  </section>;
}
export function ParticipantCompletion({ visit }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);
  const busy = useRef(false);
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const started = new Date(visit.startTime) <= now;
  const late = new Date(visit.endTime) < now;
  if (!visit.canExecute) return <p className="rounded-xl border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4 text-sm text-[var(--task-text-muted)]">{visit.status === 'COMPLETED' ? 'This visit is complete.' : 'No visit action is available.'}</p>;
  if (!started) return <div className="rounded-xl border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4"><p className="font-semibold">Visit starts {formatCareVisitStart(visit.startTime)} ET</p><p className="mt-1 text-sm text-[var(--task-text-muted)]">Completion becomes available when the visit starts.</p></div>;
  return <form className="space-y-3" action={async data => {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage(null);
    try {
      const result = await completeVisitAsSitter(data);
      setMessage(result.ok ? { ok: true, text: 'Visit completed. Your earnings have been refreshed.' } : { ok: false, text: result.error || 'Unable to complete this visit.' });
      if (result.ok) router.refresh();
    } catch { setMessage({ ok: false, text: 'The result could not be confirmed. Retry to check completion.' }); }
    finally { busy.current = false; setPending(false); }
  }}>
    <input type="hidden" name="visitId" value={visit.id} />
    {late && <label className="block text-sm font-medium">Late completion reason<textarea name="lateReason" required minLength={10} disabled={pending} className="mt-2 block min-h-24 w-full rounded-lg border p-3" /></label>}
    <button disabled={pending} className="min-h-11 rounded-lg bg-[var(--task-primary)] px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? 'Completing…' : 'Mark visit complete'}</button>
    {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
  </form>;
}
export function ParticipantVisitCard({ entry, showDetailLink = true }) {
  const { visit, location } = entry;
  const address = [location.addressLine1, location.addressLine2, location.city, location.state, location.postalCode].filter(Boolean).join(', ');
  return <article className="min-w-0 rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--task-primary)]">Coverage visit</p>
    <h3 className="mt-1 break-words text-xl font-bold text-[var(--task-text)]">{formatBookingPetNames(entry.petNames, entry.service.label)}</h3>
    <p className="mt-1 text-sm text-[var(--task-text-muted)]">{formatCareServiceLabel(entry.service.label, entry.service.durationMinutes)}</p>
    <p className="mt-4 font-semibold">{new Date(visit.startTime).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} – {new Date(visit.endTime).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET</p>
    <div className="mt-2"><StatusBadge tone={visit.status === 'COMPLETED' ? 'success' : 'neutral'}>{visit.status === 'COMPLETED' ? 'Completed' : visit.status === 'CONFIRMED' ? 'Scheduled' : visit.status}</StatusBadge></div><p className="mt-4 text-sm">Client: {entry.clientName || 'Client'}</p>
    <p className="mt-2 break-words">{address}</p>
    <div className="mt-4 rounded-xl bg-[var(--task-surface-soft)] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--task-text-muted)]">Your compensation</p><p className="mt-1 text-lg font-bold text-[var(--task-primary)]">{visit.money?.status === 'EARNED' ? 'Earned' : 'Expected'} pay: {formatFinancialCents(visit.money?.payoutCents, visit.money?.currency)}</p></div>
    {showDetailLink && <Link className="mt-3 inline-flex min-h-11 items-center rounded-lg border px-4 py-2 font-semibold" href={`/dashboard/sitter/visits/${visit.id}`}>View visit</Link>}
  </article>;
}
