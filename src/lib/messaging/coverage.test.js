import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { coverageAccess, coverageThreadWithDb, markDelivered } from './coverage.js';
import { ensureBookingConversation, historicalConversation } from './bookingThread.js';
import { surfaceLoader } from '../bookings/surfaceTestSupport.js';
const visit = { id: 'visit', bookingId: 'booking', sitterId: 'riley', assignmentRevision: 2, status: 'CONFIRMED', booking: { id: 'booking', sitterId: 'lead', status: 'CONFIRMED' } };
const thread = { id: 'thread', scope: 'COVERAGE_VISIT', visitId: 'visit', bookingId: 'booking', coverageSitterId: 'riley', assignmentRevision: 2 };
for (const [label, actor, allowed] of [['assigned', { id: 'riley', role: 'SITTER' }, true], ['operator', { id: 'operator', role: 'OPERATOR' }, true], ['unrelated', { id: 'bob', role: 'SITTER' }, false], ['lead', { id: 'lead', role: 'SITTER' }, false], ['client', { id: 'riley', role: 'CLIENT' }, false], ['signed-out', null, false]]) test(`coverage role policy: ${label}`, () => assert.equal(Boolean(coverageAccess(actor, visit, thread)), allowed));
for (const field of ['visitId', 'bookingId', 'coverageSitterId', 'assignmentRevision', 'scope']) test(`forged ${field} fails closed`, () => assert.equal(coverageAccess({ id: 'riley', role: 'SITTER' }, visit, { ...thread, [field]: 'forged' }), null));
for (const level of ['visit', 'booking']) for (const status of ['COMPLETED', 'CANCELED']) test(`${level} ${status}: read-only sitter, operator reply policy`, () => {
  const v = structuredClone(visit); (level === 'visit' ? v : v.booking).status = status;
  assert.equal(coverageAccess({ id: 'riley', role: 'SITTER' }, v, thread).canSend, false);
  assert.equal(coverageAccess({ id: 'operator', role: 'OPERATOR' }, v, thread).canSend, true);
});
test('new tenure excludes former and returning sitters from earlier histories', () => {
  assert.equal(coverageAccess({ id: 'riley', role: 'SITTER' }, { ...visit, sitterId: 'bob', assignmentRevision: 3 }, thread), null);
  assert.equal(coverageAccess({ id: 'riley', role: 'SITTER' }, { ...visit, assignmentRevision: 4 }, thread), null);
  assert.deepEqual(coverageAccess({ id: 'operator', role: 'OPERATOR' }, { ...visit, assignmentRevision: 4 }, thread), { current: false, canSend: false });
});
test('lead assignment cannot lazily acquire a coverage thread', () => assert.equal(coverageAccess({ id: 'operator', role: 'OPERATOR' }, { ...visit, sitterId: 'lead' }, null), null));
test('historical booking helper targets partial BOOKING uniqueness and preserves existing shape', async () => {
  let sql;
  assert.equal((await ensureBookingConversation({ $queryRaw: async parts => { sql = parts.join('?'); return [{ id: 'existing' }]; } }, 'booking')).id, 'existing');
  assert.match(sql, /ON CONFLICT \("bookingId"\) WHERE scope = 'BOOKING'/);
  assert.deepEqual(historicalConversation({ id: 'booking', conversations: [{ id: 'existing' }] }), { id: 'booking', conversation: { id: 'existing' } });
});
test('read marker uses delivered boundary, per-user key and monotonic update', async () => {
  const calls = [], boundary = new Date(1000);
  const tx = { conversationParticipant: { upsert: async args => calls.push(args), updateMany: async args => calls.push(args) } };
  await markDelivered(tx, 'thread', { id: 'riley', role: 'SITTER' }, boundary);
  assert.equal(calls[0].create.lastReadAt, boundary); assert.equal(calls[0].create.participantKey, 'sitter:riley');
  assert.equal(calls[1].where.OR[1].lastReadAt.lt, boundary); assert.equal(calls[1].data.lastReadAt, boundary);
  await markDelivered(tx, 'thread', { id: 'operator', role: 'OPERATOR' }, boundary);
  assert.equal(calls[2].create.participantKey, 'operator:operator');
});
test('server seam rejects anonymous and invalid content before a database transaction', async () => {
  const db = { $transaction() { throw new Error('Must not run'); } };
  await assert.rejects(coverageThreadWithDb({ db, visitId: 'visit' }), { code: 'COVERAGE_DENIED' });
  for (const body of ['', ' ', 'x'.repeat(2001), 42]) await assert.rejects(coverageThreadWithDb({ db, actorId: 'riley', visitId: 'visit', body }), { code: 'INVALID_MESSAGE' });
});
for (const role of [null, 'CLIENT', 'SITTER', 'OPERATOR']) test(`actual send action derives identity from session: ${role}`, async () => {
  let received;
  const dependencies = {
    '@/auth': { auth: async () => role ? { user: { id: 'authenticated', role } } : null },
    '@/lib/messaging/coverage': { coverageThreadWithDb: async args => { received = args; if (role === 'CLIENT') throw Object.assign(new Error(), { code: 'COVERAGE_DENIED' }); } },
    'next/cache': { revalidatePath() {} },
  };
  const { sendCoverageMessage } = surfaceLoader(null, 'unused', { dependencies }).load('app/dashboard/sitter/visit-messages/actions.js');
  const result = await sendCoverageMessage({ threadId: 'thread', body: 'Hello', actorId: 'forged', role: 'OPERATOR' });
  assert.equal(result.ok, ['SITTER', 'OPERATOR'].includes(role));
  if (role) { assert.equal(received.actorId, 'authenticated'); assert(!Object.hasOwn(received, 'role')); } else assert.equal(received, undefined);
});
for (const mode of ['anonymous', 'revoked', 'allowed']) test(`actual coverage poll ${mode}`, async () => {
  const dependencies = {
    '@/auth': { auth: async () => mode === 'anonymous' ? null : { user: { id: 'authenticated' } } },
    '@/lib/messaging/coverage': { coverageThreadWithDb: async args => { assert.equal(args.actorId, 'authenticated'); assert.equal(args.threadId, 'guessed-id'); if (mode === 'revoked') throw Object.assign(new Error(), { code: 'COVERAGE_DENIED' }); return { fingerprint: 'safe-metadata' }; } },
  };
  const { GET } = surfaceLoader(null, 'unused', { dependencies }).load('app/api/coverage-messages/poll/route.js');
  const response = await GET(new Request('http://localhost/api/coverage-messages/poll?threadId=guessed-id'));
  assert.equal(response.status, { anonymous: 401, revoked: 403, allowed: 200 }[mode]);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert(!(await response.text()).includes('body'));
});
const uiThread = { ...thread, label: 'Coverage — Biscuit', startTime: '2030-09-20T13:00:00Z', endTime: '2030-09-20T13:30:00Z', revision: 2, current: true, canSend: true, sitterName: 'Riley', fingerprint: 'f', messages: [{ id: 'message', body: 'Private visit question', senderType: 'SITTER', senderUser: { name: 'Riley' }, createdAt: '2030-09-20T13:00:00Z' }] };
function uiHarness() {
  let index = 0; const states = [], effects = [];
  const react = { ...React, useState(initial) { const key = index++; if (!(key in states)) states[key] = initial; return [states[key], value => { states[key] = value; }]; }, useTransition: () => [false, async work => work()], useEffect: effect => effects.push(effect) };
  const Component = surfaceLoader(null, 'unused', { react }).load('components/messaging/CoverageThread.jsx').default;
  return { effects, render(props = {}) { index = 0; return renderToStaticMarkup(React.createElement(Component, { thread: uiThread, ...props })); } };
}
for (const terminal of [false, true]) test(`coverage UI is bounded and ${terminal ? 'read-only' : 'actionable'}`, () => {
  const html = uiHarness().render({ thread: { ...uiThread, terminal, canSend: !terminal } });
  for (const text of ['Coverage visit', 'Biscuit', 'Riley', 'Coverage sitter', 'View visit', 'Private visit question']) assert(html.includes(text));
  assert.equal(html.includes('<textarea'), !terminal); assert.equal(html.includes('Read-only conversation'), terminal);
  for (const text of ['Approve cancellation', 'Cancel booking', 'Reassign', 'Payout', 'Historical client']) assert(!html.includes(text));
});
test('revoked poll clears previously rendered messages and stops active view', async () => {
  const originals = Object.fromEntries(['window', 'document', 'fetch'].map(key => [key, globalThis[key]]));
  const listeners = {};
  globalThis.window = { addEventListener: (key, fn) => { listeners[key] = fn; }, removeEventListener() {} };
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async () => ({ status: 403, ok: false });
  let cleanup;
  try {
    const h = uiHarness(); assert(h.render().includes('Private visit question'));
    cleanup = h.effects[0](); await new Promise(resolve => setImmediate(resolve));
    const html = h.render(); assert(!html.includes('Private visit question')); assert(html.includes('Visit messages unavailable')); assert(!html.includes('<textarea'));
  } finally { cleanup?.(); for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
test('coverage inbox labels each tenure and links independently', () => {
  const Component = surfaceLoader(null, 'unused', { react: { ...React, useEffect() {} } }).load('components/messaging/CoverageInbox.jsx').default;
  const html = renderToStaticMarkup(React.createElement(Component, { operator: true, threads: [{ ...uiThread, unreadCount: 61 }, { ...uiThread, id: 'old-thread', revision: 1, current: false }] }));
  assert(html.includes('61 unread')); assert(html.includes('Historical assignment')); assert(html.includes('/dashboard/operator/messages/old-thread')); assert(html.includes('Sep 20'));
});
test('migration owns assignment advancement, partial uniqueness and composite parent FK', () => {
  const sql = readFileSync('prisma/migrations/20260918000000_visit_participant_messaging/migration.sql', 'utf8');
  assert.match(sql, /NEW\."sitterId" IS DISTINCT FROM OLD\."sitterId"/);
  assert.match(sql, /FOREIGN KEY \("visitId", "bookingId"\) REFERENCES "Visit"\("id", "bookingId"\)/);
  assert.match(sql, /WHERE "scope" = 'BOOKING'/);
  assert.match(sql, /BEFORE INSERT ON "Message"/);
});

test('operator inbox server surface separates coverage and BOOKING context', async () => {
  const dependencies = {
    '@/lib/messaging/coverage': { coverageInboxWithDb: async () => [uiThread] },
    '@/lib/db': { prisma: { conversation: { findMany: async args => { assert.deepEqual(args.where, { scope: 'BOOKING' }); return [{ id: 'historical', bookingId: 'booking', booking: { petNames: ['Other pet'], client: { name: 'Client' } } }]; } } } },
  };
  const loader = surfaceLoader(null, 'operator', { dependencies, react: { ...React, useEffect() {} } });
  const html = renderToStaticMarkup(await loader.load('app/dashboard/operator/messages/page.jsx').default());
  assert(html.includes('Coverage visit messages')); assert(html.includes('Booking conversations'));
  assert(html.includes('/dashboard/operator/messages/thread')); assert(html.includes('/dashboard/messages/booking'));
});
test('sitter inbox server surface keeps coverage entries separate from historical Booking entries', async () => {
  const dependencies = {
    '@/lib/messaging/coverage': { coverageInboxWithDb: async () => [uiThread] },
    '@/lib/messaging/getSitterConversations': { getSitterConversations: async () => [] },
  };
  const loader = surfaceLoader(null, 'riley', { dependencies, react: { ...React, useEffect() {} } });
  const html = renderToStaticMarkup(await loader.load('app/dashboard/sitter/messages/page.jsx').default());
  assert(html.includes('Coverage visit messages')); assert(html.includes('/dashboard/sitter/visit-messages/thread'));
});
