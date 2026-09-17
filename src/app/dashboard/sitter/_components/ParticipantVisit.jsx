'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { completeVisitAsSitter } from '../actions';
import { formatFinancialCents } from '@/lib/bookings/economics/bookingEconomics';

export function CareInstructions({ text }) {
  return <section className="rounded-xl border border-[var(--task-border)] bg-white p-4">
    <h2 className="font-semibold">Care instructions</h2>
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
  if (!visit.canExecute) return null;
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
    <button disabled={pending || !started} className="min-h-11 rounded-lg bg-[var(--task-primary)] px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? 'Completing…' : started ? 'Mark visit complete' : 'Available when visit starts'}</button>
    {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
  </form>;
}
export function ParticipantVisitCard({ entry, showDetailLink = true }) {
  const { visit, location } = entry;
  const address = [location.addressLine1, location.addressLine2, location.city, location.state, location.postalCode].filter(Boolean).join(', ');
  return <article className="min-w-0 rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--task-primary)]">Coverage visit</p>
    <h3 className="mt-1 break-words text-lg font-bold">{entry.petNames.join(', ') || entry.service.label}</h3>
    <p>{entry.service.label}{entry.service.durationMinutes ? ` · ${entry.service.durationMinutes} minutes` : ''}</p>
    <p className="mt-2">{new Date(visit.startTime).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} – {new Date(visit.endTime).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET</p>
    <p>Status: {visit.status}</p><p>Client: {entry.clientName || 'Client'}</p>
    <p className="mt-2 break-words">{address}</p>
    <p className="mt-2 font-semibold">{visit.money?.status === 'EARNED' ? 'Earned' : 'Expected'} pay: {formatFinancialCents(visit.money?.payoutCents, visit.money?.currency)}</p>
    {showDetailLink && <Link className="mt-3 inline-flex min-h-11 items-center rounded-lg border px-4 py-2 font-semibold" href={`/dashboard/sitter/visits/${visit.id}`}>View visit</Link>}
  </article>;
}
