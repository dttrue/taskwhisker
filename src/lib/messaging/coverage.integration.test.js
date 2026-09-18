import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceLoader } from '../bookings/surfaceTestSupport.js';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { authenticateCanonicalQa } from '../../../scripts/canonical-booking-qa.mjs';
import { messagingProtectedState } from '../../../scripts/participant-messaging-qa.mjs';
import { setupMessagingFixtures, messagingBooking, messagingHandoff, cleanupMessagingFixtures } from './qaFixtures.js';
import { coverageThreadWithDb, coverageInboxWithDb, markDelivered } from './coverage.js';
import { ensureBookingConversation } from './bookingThread.js';
import { createSystemMessage } from './createSystemMessage.js';
import { assignBookingSitterWithDb } from '../bookings/confirmation/confirmationService.js';
import { cancelCanonicalBookingWithDb } from '../bookings/cancellation/canonicalCancellation.js';

test('PostgreSQL coverage messaging, tenure, database invariants and concurrency', { skip: process.env.TASKWHISKER_MESSAGING_QA_TESTS !== '1', timeout: 600000 }, async t => {
  await authenticateCanonicalQa();
  const db = new PrismaClient({ log: [] });
  const baseline = await messagingProtectedState(db);
  let state;
  try {
    state = await setupMessagingFixtures(db);
    const { operator, lead, riley, bob, outsider } = state.identities;
    const b = await messagingBooking(db, state, 3), other = await messagingBooking(db, state, 1);
    const visitId = b.visits[0].id, secondVisitId = b.visits[1].id;
    const thread = args => coverageThreadWithDb({ db, actorId: riley, visitId, ...args });
    const rejectAccess = args => assert.rejects(thread(args), { code: 'COVERAGE_DENIED' });
    let current, old, returned;
    const historic = await ensureBookingConversation(db, b.id);
    const historicalMessage = await db.message.create({ data: { conversationId: historic.id, senderType: 'CLIENT', body: 'Historical client-only booking context' } });
    await t.test('baseline assignment 1; handoff increments once; no-op and replay remain stable', async () => {
      assert(b.visits.every(v => v.assignmentRevision === 1));
      const key = randomUUID();
      assert((await messagingHandoff(db, state, b, riley, [visitId, secondVisitId], key)).ok);
      let v = await db.visit.findUnique({ where: { id: visitId } }); assert.equal(v.assignmentRevision, 2);
      assert.equal((await messagingHandoff(db, state, b, riley, [visitId, secondVisitId], key)).code, 'HANDOFF_REPLAY');
      await db.visit.update({ where: { id: visitId }, data: { sitterId: riley, assignmentRevision: 99 } });
      v = await db.visit.findUnique({ where: { id: visitId } }); assert.equal(v.assignmentRevision, 2);
      assert.equal((await messagingHandoff(db, state, b, riley)).ok, false);
    });
    await t.test('whole-booking assignment and unassignment use the same tenure trigger', async () => {
      const start = new Date('2039-10-01T13:00:00Z'), end = new Date('2039-10-01T13:30:00Z');
      const legacy = await db.booking.create({ data: { operatorId: operator, sitterId: lead, clientId: other.clientId, status: 'REQUESTED', startTime: start, endTime: end,
        clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250,
        visits: { create: { operatorId: operator, sitterId: lead, date: start, startTime: start, endTime: end, status: 'PENDING' } } }, include: { visits: true } });
      const assign = sitterId => assignBookingSitterWithDb({ db, bookingId: legacy.id, actorId: operator, sitterId });
      const revision = async () => (await db.visit.findUnique({ where: { id: legacy.visits[0].id } })).assignmentRevision;
      assert.equal(await revision(), 1); assert((await assign(riley)).ok); assert.equal(await revision(), 2);
      assert.equal((await assign(riley)).code, 'ALREADY_ASSIGNED'); assert.equal(await revision(), 2);
      assert((await assign(null)).ok); assert.equal(await revision(), 3);
      assert((await assign(bob)).ok); assert.equal(await revision(), 4);
    });
    await t.test('concurrent lazy creation has one identity and sends are stable', async () => {
      const rows = await Promise.all(Array.from({ length: 5 }, () => thread({})));
      assert.equal(new Set(rows.map(r => r.id)).size, 1); current = rows[0]; old = current;
      assert.equal(await db.conversation.count({ where: { visitId, assignmentRevision: 2 } }), 1);
      assert.equal((await thread({ body: 'Which entrance should I use?' })).id, current.id);
      assert.equal((await thread({ actorId: operator, body: 'Use the side entrance.' })).id, current.id);
      const messages = (await thread({})).messages;
      assert.deepEqual(messages.map(m => m.senderType), ['SITTER', 'OPERATOR']);
      assert(messages.every(m => m.senderUser.name));
      assert(messages.every(m => m.id !== historicalMessage.id));
    });
    await t.test('direct IDs, anonymous, unrelated, lead, client token and wrong Visit are denied', async () => {
      for (const actorId of [null, lead, bob, outsider, b.clientLinkToken]) await rejectAccess({ actorId, threadId: current.id });
      await rejectAccess({ threadId: historic.id });
      await rejectAccess({ threadId: current.id, visitId: other.visits[0].id });
      await rejectAccess({ visitId: b.visits[2].id });
      const operatorThread = await thread({ actorId: operator, threadId: current.id }); assert.equal(operatorThread.id, current.id);
      const otherThread = await thread({ visitId: secondVisitId }); assert.notEqual(otherThread.id, current.id); assert.equal(otherThread.messages.length, 0);
    });
    await t.test('database scope, uniqueness, parent consistency, sitter role and immutable identity', async () => {
      const create = data => db.conversation.create({ data });
      await assert.rejects(create({ bookingId: b.id }));
      const base = { scope: 'COVERAGE_VISIT', bookingId: b.id, visitId, coverageSitterId: riley, assignmentRevision: 2 };
      await assert.rejects(create(base));
      for (const field of ['visitId', 'coverageSitterId', 'assignmentRevision']) await assert.rejects(create({ ...base, [field]: null }));
      await assert.rejects(create({ ...base, bookingId: other.id }));
      await assert.rejects(create({ ...base, coverageSitterId: operator }));
      await assert.rejects(create({ ...base, scope: 'BOOKING' }));
      await assert.rejects(db.conversation.update({ where: { id: current.id }, data: { assignmentRevision: 99 } }));
      await assert.rejects(db.message.create({ data: { conversationId: current.id, senderType: 'OPERATOR', body: 'Missing author' } }));
      await assert.rejects(db.message.create({ data: { conversationId: current.id, senderType: 'OPERATOR', senderUserId: riley, body: 'Forged role' } }));
      const constraints = await db.$queryRaw`SELECT conname FROM pg_constraint WHERE conrelid = '"Conversation"'::regclass AND contype = 'f'`;
      assert(constraints.some(c => c.conname === 'Conversation_visitId_bookingId_fkey'));
    });
    await t.test('unread counts exceed old windows and are independent of outgoing and BOOKING messages', async () => {
      for (let i = 0; i < 55; i++) await thread({ actorId: operator, body: `Operational update ${i + 1}` });
      assert.equal((await thread({})).unreadCount, 56);
      assert.equal((await thread({ actorId: operator })).unreadCount, 1);
      await thread({ markRead: true });
      assert.equal((await thread({})).unreadCount, 0);
      assert.equal((await thread({ actorId: operator })).unreadCount, 1);
      await thread({ actorId: operator, markRead: true });
      assert.equal((await thread({ actorId: operator })).unreadCount, 0);
      assert.equal(await db.conversationParticipant.count({ where: { conversationId: historic.id } }), 0);
      const delivered = (await thread({})).messages.at(-1).createdAt;
      await thread({ actorId: operator, body: 'Arrived after delivery boundary' });
      await markDelivered(db, current.id, { id: riley, role: 'SITTER' }, delivered);
      assert.equal((await thread({})).unreadCount, 1);
      // An older tab must never move the read cursor backwards.
      await thread({ markRead: true });
      await markDelivered(db, current.id, { id: riley, role: 'SITTER' }, delivered);
      assert.equal((await thread({})).unreadCount, 0);
      const timestamps = (await thread({})).messages.map(m => +m.createdAt);
      assert.equal(new Set(timestamps).size, timestamps.length);
    });
    await t.test('concurrent message insertion is ordered after delivered cursor', async () => {
      const before = (await thread({ markRead: true })).messages.at(-1).createdAt;
      await Promise.all(Array.from({ length: 5 }, (_, i) => thread({ actorId: operator, body: `Concurrent update ${i}` })));
      await markDelivered(db, current.id, { id: riley, role: 'SITTER' }, before);
      assert.equal((await thread({})).unreadCount, 5);
    });
    await t.test('Riley to Bob to Riley creates new tenure; former and returning sitter cannot reopen history', async () => {
      assert((await messagingHandoff(db, state, b, bob)).ok);
      await rejectAccess({ threadId: old.id }); await rejectAccess({ threadId: old.id, body: 'Cannot send' });
      const next = await thread({ actorId: bob }); assert.equal(next.revision, 3); assert.equal(next.messages.length, 0);
      await thread({ actorId: bob, body: 'Bob private coverage history' });
      assert((await messagingHandoff(db, state, b, riley)).ok);
      returned = await thread({}); assert.equal(returned.revision, 4); assert.equal(returned.messages.length, 0);
      await rejectAccess({ threadId: old.id }); await rejectAccess({ threadId: next.id });
      await rejectAccess({ actorId: bob, threadId: next.id }); await rejectAccess({ actorId: bob, threadId: returned.id });
      assert.equal((await thread({ actorId: operator, threadId: old.id })).current, false);
      assert.equal((await thread({ actorId: operator, threadId: next.id })).current, false);
      const inbox = await coverageInboxWithDb({ db, actorId: riley }); assert(!inbox.some(t => [old.id, next.id].includes(t.id)));
      const all = await coverageInboxWithDb({ db, actorId: operator }); assert(all.some(t => t.id === old.id)); assert(all.some(t => t.id === next.id));
    });
    await t.test('message and reassignment locking prevents stale tenure sends', async () => {
      // Hold the Booking lock, commit reassignment, then let a waiting send resume.
      let locked, release, attempted, firstPid, secondPid;
      const acquired = new Promise(r => { locked = r; }), gate = new Promise(r => { release = r; });
      const attempt = new Promise(r => { attempted = r; });
      const change = db.$transaction(async tx => {
        [{ pid: firstPid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${b.id} FOR UPDATE`;
        await tx.visit.update({ where: { id: visitId }, data: { sitterId: bob } }); locked(); await gate;
      }, { timeout: 30000 });
      await acquired;
      const waitingDb = { $transaction: (work, options) => db.$transaction(async tx => {
        [{ pid: secondPid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        return work(new Proxy(tx, { get(target, key) {
          if (key !== '$queryRaw') return Reflect.get(target, key);
          return (parts, ...values) => {
            const pending = target.$queryRaw(parts, ...values).then(value => value);
            if (parts.join('?').includes('"Booking"') && parts.join('?').includes('FOR UPDATE')) attempted();
            return pending;
          };
        } }));
      }, options) };
      const send = thread({ db: waitingDb, threadId: returned.id, body: 'Must be rejected after lock wait' });
      const asserted = assert.rejects(send, { code: 'COVERAGE_DENIED' });
      let observed = false;
      try {
        await attempt;
        for (let i = 0; i < 80; i++) {
          const [{ blockers }] = await db.$queryRaw`SELECT pg_blocking_pids(${secondPid}::int) AS blockers`;
          if (blockers.includes(firstPid)) { observed = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } finally { release(); await change; await asserted; }
      assert(observed, 'Send must wait on the reassignment transaction lock.');
      await db.visit.update({ where: { id: visitId }, data: { sitterId: riley } });
    });
    await t.test('completed and canceled Visit or Booking closes sitter sends, preserves current read and operator policy', async () => {
      for (const level of ['visit', 'booking']) for (const status of ['COMPLETED', 'CANCELED']) {
        const target = level === 'visit' ? visitId : b.id;
        await db[level].update({ where: { id: target }, data: { status } });
        const row = await thread({}); assert.equal(row.canSend, false);
        await assert.rejects(thread({ body: 'Terminal sitter send' }), { code: 'COVERAGE_READ_ONLY' });
        assert.equal((await thread({ actorId: operator, body: 'Operator follow-up' })).canSend, true);
        await db[level].update({ where: { id: target }, data: { status: 'CONFIRMED' } });
      }
    });
    await t.test('actual historical loaders, sends, schedule-change and cancellation actions remain isolated', async () => {
      const dependencies = { '@/lib/db': { prisma: db }, 'next/cache': { revalidatePath() {} }, '@/auth': { auth: async () => ({ user: { id: lead, email: `${lead}@example.invalid` } }), requireRole: async () => ({ user: { id: operator, role: 'OPERATOR' } }) } };
      const loader = surfaceLoader(null, lead, { db, dependencies });
      const historicalRead = loader.load('lib/messaging/getBookingConversation.js').getBookingConversation;
      const clientRead = loader.load('lib/messaging/getClientBookingConversation.js').getClientBookingConversation;
      const leadInbox = loader.load('lib/messaging/getSitterConversations.js').getSitterConversations;
      const before = await historicalRead(b.id); assert.equal(before.id, historic.id); assert(before.messages.some(m => m.id === historicalMessage.id));
      assert.equal((await clientRead(b.clientLinkToken)).conversation.id, historic.id);
      assert((await leadInbox({ sitterId: lead })).every(c => c.scope === 'BOOKING'));
      const form = object => { const result = new FormData(); for (const [key, value] of Object.entries(object)) result.set(key, value); return result; };
      await loader.load('app/dashboard/sitter/messages/actions.js').sendSitterBookingMessage(form({ bookingId: b.id, body: 'Lead historical reply' }));
      await loader.load('app/dashboard/messages/actions.js').sendBookingMessage(form({ bookingId: b.id, body: 'Operator historical reply' }));
      assert((await loader.load('app/client/bookings/[clientLinkToken]/messages/actions.js').sendClientBookingMessage(form({ clientLinkToken: b.clientLinkToken, body: 'Client historical reply' }))).ok);
      const actions = loader.load('app/client/bookings/[clientLinkToken]/actions.js');
      assert((await actions.requestClientScheduleChange(form({ clientLinkToken: b.clientLinkToken, visitId, requestedDate: '2030-11-01', requestedStartTime: '10:00', requestedEndTime: '10:30', reason: 'Schedule clarification' }))).ok);
      assert((await actions.requestClientBookingCancellation(form({ clientLinkToken: b.clientLinkToken, reason: 'Plans changed' }))).ok);
      const after = await historicalRead(b.id); assert(after.messages.some(m => m.body.startsWith('Schedule change request:'))); assert(after.messages.some(m => m.body.startsWith('Cancellation request:')));
      assert(!(await thread({})).messages.some(m => /historical reply|Schedule change request:|Cancellation request:/.test(m.body)));
      const canceled = await cancelCanonicalBookingWithDb({ db, bookingId: other.id, actorId: operator, reason: 'Synthetic cancellation' }); assert(canceled.ok);
      const cancellationThread = await historicalRead(other.id); assert.equal(cancellationThread.scope, 'BOOKING'); assert(cancellationThread.messages.some(m => m.senderType === 'SYSTEM'));
    });
    await t.test('historical upsert/system messages remain BOOKING and coverage grants no cancellation', async () => {
      const rows = await Promise.all(Array.from({ length: 3 }, () => ensureBookingConversation(db, b.id)));
      assert(rows.every(row => row.id === historic.id));
      await createSystemMessage({ tx: db, bookingId: b.id, body: 'Historical system context' });
      const last = await db.message.findFirst({ where: { conversationId: historic.id }, orderBy: { createdAt: 'desc' } }); assert.equal(last.senderType, 'SYSTEM');
      assert.equal((await cancelCanonicalBookingWithDb({ db, bookingId: b.id, actorId: riley, reason: 'No authority' })).status, 'NOT_AUTHORIZED');
      assert(!(await thread({})).messages.some(m => m.body.includes('Historical')));
    });
  } finally {
    try { if (state) await cleanupMessagingFixtures(db, state); assert.deepEqual(await messagingProtectedState(db), baseline); console.log('Messaging QA: protected counts and all pre-existing messaging/Visit data exactly restored.'); }
    finally { await db.$disconnect(); }
  }
});
