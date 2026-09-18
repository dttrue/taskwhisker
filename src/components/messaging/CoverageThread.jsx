'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendCoverageMessage } from '@/app/dashboard/sitter/visit-messages/actions';
const date = (value, timeZone = 'America/New_York') => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short' });
export default function CoverageThread({ thread, operator = false }) {
  const router = useRouter();
  const [revoked, setRevoked] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const inbox = operator ? '/dashboard/operator/messages' : '/dashboard/sitter/messages';
  useEffect(() => {
    if (revoked) return;
    let stopped = false, inFlight = false;
    async function poll() {
      if (stopped || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const response = await fetch(`/api/coverage-messages/poll?threadId=${encodeURIComponent(thread.id)}`, { cache: 'no-store' });
        if (stopped) return;
        if ([401, 403].includes(response.status)) { setRevoked(true); setBody(''); return; }
        if (response.ok && (await response.json()).fingerprint !== thread.fingerprint) router.refresh();
      } catch { /* Retry while the page is active. */ }
      finally { inFlight = false; }
    }
    const timer = setInterval(poll, 15000);
    window.addEventListener('focus', poll); document.addEventListener('visibilitychange', poll);
    void poll();
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll); };
  }, [thread.id, thread.fingerprint, router, revoked]);
  if (revoked) return <main className="mx-auto max-w-2xl space-y-4 p-5"><h1 className="text-2xl font-bold">Visit messages unavailable</h1><p>Your access to this visit has changed.</p><Link className="underline" href={inbox}>Return to messages</Link></main>;
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-28 text-[var(--task-text)] sm:px-6">
    <div className="flex flex-wrap justify-between gap-3 text-sm"><Link href={inbox} className="underline">Back to messages</Link><Link className="underline" href={operator ? `/dashboard/operator/bookings/${thread.bookingId}` : `/dashboard/sitter/visits/${thread.visitId}`}>{operator ? 'View booking' : 'View visit'}</Link></div>
    <header className="rounded-2xl border border-[var(--task-border)] bg-white p-5"><p className="text-xs font-semibold uppercase tracking-widest text-[var(--task-primary)]">Coverage visit · {thread.current ? 'Current assignment' : 'Historical assignment'}</p><h1 className="mt-2 text-2xl font-bold">{thread.label}</h1><p className="mt-2">{date(thread.startTime, thread.timeZone)} – {date(thread.endTime, thread.timeZone)}</p><p className="mt-1 text-sm text-[var(--task-text-muted)]">Coverage sitter: {thread.sitterName || 'Sitter'} · Assignment {thread.revision}</p><p className="mt-3 text-sm">Private messages between the operator and this visit’s coverage sitter.</p></header>
    <section aria-label="Visit messages" className="space-y-4 rounded-2xl border border-[var(--task-border)] bg-white p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Visit messages</h2>
      {!thread.messages.length && <p className="text-sm text-[var(--task-text-muted)]">No messages yet. Ask about access, care, or timing for this visit.</p>}
      {thread.messages.map(message => <article key={message.id} className={`rounded-xl border p-4 ${message.senderType === 'OPERATOR' ? 'border-[#c7d9cf] bg-[#f0f6f2]' : 'border-[var(--task-border)] bg-zinc-50'}`}><div className="flex flex-wrap justify-between gap-2 text-sm"><p className="font-semibold">{message.senderUser?.name || (message.senderType === 'OPERATOR' ? 'Operator' : 'Sitter')} <span className="font-normal text-[var(--task-text-muted)]">· {message.senderType === 'OPERATOR' ? 'Operator' : 'Coverage sitter'}</span></p><time className="text-xs text-[var(--task-text-muted)]" dateTime={new Date(message.createdAt).toISOString()}>{date(message.createdAt, thread.timeZone)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p></article>)}
      {thread.canSend ? <form className="space-y-3 border-t border-[var(--task-border)] pt-4" onSubmit={event => { event.preventDefault(); setError(''); startTransition(async () => { const result = await sendCoverageMessage({ threadId: thread.id, body }); if (result.revoked) { setBody(''); setRevoked(true); } else if (result.readOnly) { setBody(''); router.refresh(); } else if (!result.ok) setError(result.error); else { setBody(''); router.refresh(); } }); }}><label className="block text-sm font-semibold" htmlFor="coverage-message">Message {operator ? 'coverage sitter' : 'operator'}</label><textarea id="coverage-message" required maxLength={2000} rows={4} value={body} onChange={event => setBody(event.target.value)} className="w-full rounded-xl border border-[var(--task-border)] bg-white p-3 text-base"/><p aria-live="polite" className="text-sm text-red-700">{error}</p><button disabled={pending || !body.trim()} className="min-h-11 w-full rounded-xl bg-[var(--task-primary)] px-5 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto">{pending ? 'Sending…' : 'Send message'}</button></form> : <div className="rounded-xl bg-zinc-100 p-4"><p className="font-semibold">Read-only conversation</p><p className="mt-1 text-sm">{thread.current ? 'This visit or booking has ended. You can still read messages from this assignment.' : 'This assignment has ended. Messages remain available for operator review.'}</p></div>}
    </section>
  </main>;
}
