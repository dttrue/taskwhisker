'use client';
import { useState } from 'react';
import { ParticipantVisitCard } from './ParticipantVisit';
import { isSameDay } from '../lib/sitterDashboardUtils';
export default function CoverageVisits({ entries, now }) {
  const [tab, setTab] = useState('Today');
  const [page, setPage] = useState(1);
  if (!entries.length) return null;
  const groups = {
    Today: entries.filter(e => e.visit.status !== 'COMPLETED' && isSameDay(new Date(e.visit.startTime), now)),
    Upcoming: entries.filter(e => e.visit.status !== 'COMPLETED' && new Date(e.visit.startTime) > now && !isSameDay(new Date(e.visit.startTime), now)),
    Missed: entries.filter(e => e.visit.status !== 'COMPLETED' && new Date(e.visit.endTime) < now && !isSameDay(new Date(e.visit.startTime), now)),
    Completed: entries.filter(e => e.visit.status === 'COMPLETED').toReversed(),
  };
  const current = groups[tab];
  const pages = Math.max(1, Math.ceil(current.length / 10));
  const activePage = Math.min(page, pages);
  return <section className="space-y-4" aria-labelledby="coverage-visits-title">
    <h2 id="coverage-visits-title" className="text-xl font-bold">Your coverage visits</h2>
    <div className="flex flex-wrap gap-2">{Object.keys(groups).map(label => <button key={label} type="button" aria-pressed={tab === label} onClick={() => { setTab(label); setPage(1); }} className="min-h-11 rounded-lg border bg-white px-3 py-2 aria-pressed:border-[var(--task-primary)] aria-pressed:font-bold">{label} ({groups[label].length})</button>)}</div>
    {!current.length && <p>No coverage visits in this view.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{current.slice((activePage-1)*10,activePage*10).map(entry => <ParticipantVisitCard key={entry.id} entry={entry} />)}</div>
    {pages > 1 && <div className="flex items-center gap-3"><button disabled={activePage === 1} onClick={() => setPage(activePage-1)} className="min-h-11 rounded border px-3 disabled:opacity-50">Previous</button><span>{activePage} of {pages}</span><button disabled={activePage === pages} onClick={() => setPage(activePage+1)} className="min-h-11 rounded border px-3 disabled:opacity-50">Next</button></div>}
  </section>;
}
