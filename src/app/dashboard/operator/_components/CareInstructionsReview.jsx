'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveCareInstructions } from '../bookings/careActions';

export default function CareInstructionsReview({ bookingId, historicalNotes, careInstructions, ready, operationId }) {
  const [text, setText] = useState(ready ? careInstructions || '' : '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);
  const submitting = useRef(false);
  const router = useRouter();
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setMessage(null);
    try {
      const result = await approveCareInstructions({ bookingId, careInstructions: text, operationId });
      setMessage({ ok: result.ok, text: result.ok ? 'Care instructions approved.' : result.error });
      if (result.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: 'The save could not be confirmed. Try again; identical saves are safe.' });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <section aria-labelledby="care-review-title" className="min-w-0 rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="care-review-title" className="text-lg font-semibold text-[var(--task-text)]">Care instructions review</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ready ? 'bg-[var(--task-success-soft)] text-[#285844]' : 'bg-[var(--task-warning-soft)] text-[#704c16]'}`}>
          {ready ? 'Reviewed · care ready' : 'Review required'}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--task-text-muted)]">Review the historical booking notes and save only the care information that may be shared with an assigned sitter.</p>
      {ready && !careInstructions ? <p className="mt-2 text-sm font-medium text-[#285844]">Reviewed: no additional care instructions</p> : null}
      <div className="mt-4 grid min-w-0 gap-5 md:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-[var(--task-surface-soft)] p-4">
          <h3 className="text-sm font-semibold text-[var(--task-text)]">Historical booking notes</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--task-text-muted)]">Source material for your review. Saving care instructions does not change these notes.</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--task-text)]">{historicalNotes || 'No historical booking notes.'}</p>
        </div>
        <form onSubmit={submit} className="min-w-0">
          <label htmlFor="approved-care" className="block text-sm font-semibold text-[var(--task-text)]">Care instructions for sitters</label>
          <p id="care-help" className="mt-1 text-xs leading-5 text-[var(--task-text-muted)]">Include feeding, medication, routines, and service access guidance. Leave empty if there are no additional care instructions.</p>
          <textarea id="approved-care" aria-describedby="care-help care-sharing" value={text} onChange={event => setText(event.target.value)} maxLength={1000} rows={6} disabled={pending}
            className="mt-2 block w-full min-w-0 rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white p-3 text-base text-[var(--task-text)] focus:outline-2 focus:outline-[var(--task-primary)] disabled:opacity-60" />
          <p id="care-sharing" className="mt-2 text-sm font-medium text-[var(--task-text)]">These instructions may be shown to sitters assigned to this booking.</p>
          <button type="submit" disabled={pending} className="mt-3 min-h-11 w-full rounded-[var(--task-radius-control)] bg-[var(--task-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">
            {pending ? 'Saving approval…' : ready ? 'Save approved care instructions' : 'Approve care instructions'}
          </button>
          {message ? <p role={message.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${message.ok ? 'text-[#285844]' : 'text-[#86382f]'}`}>{message.text}</p> : null}
        </form>
      </div>
    </section>
  );
}
