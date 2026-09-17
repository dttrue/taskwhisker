'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitVisitHandoff, previewVisitHandoff } from '../bookings/handoffActions';

export default function VisitCoverage({ bookingId, visits, sitters, careReady }) {
  const [selected, setSelected] = useState([]);
  const [sitterId, setSitterId] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const attempt = useRef(null);
  const busy = useRef(false);
  const router = useRouter();
  const valid = careReady && selected.length > 0 && sitterId && selected.every(id => visits.some(v => v.id === id && v.eligible));
  function changeSelection(next) { setSelected(next); attempt.current = null; setFeedback(null); }
  async function run(preview) {
    if (!valid || busy.current) return;
    busy.current = true; setPending(true); setFeedback(null);
    const input = { bookingId, visitIds: [...selected].sort(), sitterId };
    if (!attempt.current) attempt.current = { ...input, operationId: crypto.randomUUID() };
    try {
      const result = await (preview ? previewVisitHandoff(input) : submitVisitHandoff(attempt.current));
      const name = sitters.find(s => s.id === sitterId)?.name || 'selected sitter';
      setFeedback(result.ok ? { ok: true, text: preview ? result.message : result.replay ?
        `This handoff was already saved: ${result.count} visit${result.count === 1 ? '' : 's'} reassigned to ${name}. Current assignments are shown below.` :
        `${result.count} visit${result.count === 1 ? '' : 's'} reassigned to ${name}.` } : { ok: false, text: result.error });
      if (result.ok && !preview) { setSelected([]); attempt.current = null; router.refresh(); }
    } catch { setFeedback({ ok: false, text: 'The result could not be confirmed. Retry without changing the selection to safely check this handoff.' }); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-white p-4 sm:p-5" aria-labelledby="coverage-title" aria-busy={pending}>
    <h2 id="coverage-title" className="text-xl font-bold text-[var(--task-text)]">Visit Coverage</h2>
    <p className="mt-2 text-sm text-[var(--task-text-muted)]">{careReady ? 'Care instructions ready' : 'Care instructions need review before handoff'}</p>
    <p className="mt-1 text-sm text-[var(--task-text-muted)]">Select the future visits that need coverage. The lead sitter keeps the full booking schedule.</p>
    <fieldset disabled={pending} className="mt-4 min-w-0 space-y-3">
      <legend className="sr-only">Visits to hand off</legend>
      {visits.map(visit => <label key={visit.id} className="flex items-start gap-3 rounded-xl border border-[var(--task-border)] p-3">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={selected.includes(visit.id)} disabled={!visit.eligible}
          aria-describedby={`eligibility-${visit.id}`} onChange={event => changeSelection(event.target.checked ? [...selected, visit.id] : selected.filter(id => id !== visit.id))} />
        <span className="min-w-0 break-words text-sm">
          <span className="block font-semibold">{new Date(visit.startTime).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} – {new Date(visit.endTime).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET</span>
          <span className="block">Scheduled: {visit.scheduledSitterName} · {visit.status}</span>
          {visit.performedByName && <span className="block">Performed by: {visit.performedByName}</span>}
          <span id={`eligibility-${visit.id}`} className="block text-[var(--task-text-muted)]">{visit.reason || 'Eligible for handoff'}</span>
        </span>
      </label>)}
      <label className="block text-sm font-semibold" htmlFor="coverage-sitter">Replacement sitter</label>
      <select id="coverage-sitter" value={sitterId} disabled={!careReady} className="min-h-11 w-full rounded-lg border p-2 sm:max-w-sm" onChange={event => { setSitterId(event.target.value); attempt.current = null; setFeedback(null); }}>
        <option value="">Choose a sitter</option>
        {sitters.map(s => <option key={s.id} value={s.id}>{s.name || s.email || 'Sitter'}</option>)}
      </select>
      <p className="text-sm">{selected.length} visit{selected.length === 1 ? '' : 's'} selected</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!valid} onClick={() => run(true)} className="min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50">Check availability</button>
        <button type="button" disabled={!valid} onClick={() => run(false)} className="min-h-11 rounded-lg bg-[var(--task-primary)] px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? 'Checking / saving…' : 'Hand off selected visits'}</button>
      </div>
    </fieldset>
    {feedback && <p role={feedback.ok ? 'status' : 'alert'} className="mt-4 rounded-lg border p-3 text-sm">{feedback.text}</p>}
  </section>;
}
