import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { quoteManualBooking, createManualBooking } from './manualBooking.js';
import { bookingTransaction, assertBookingAvailability } from '../calendar/bookingTransaction.js';
import { businessDateKey, addCalendarDays, businessWallTime } from '../calendar/businessTime.js';

// Never loads .env or defaults to DATABASE_URL. Requires an already provisioned,
// disposable local schema; this test performs no DDL, migration, or seed command.
test('isolated PostgreSQL: manual atomicity, replay and concurrent public/manual availability', {
  skip: process.env.TASKWHISKER_SCHEDULE_QA_TESTS !== '1', timeout: 60000,
}, async () => {
  const url = new URL(process.env.TASKWHISKER_SCHEDULE_QA_URL || 'invalid:');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only loopback QA is allowed');
  assert.ok(url.pathname.endsWith('_schedule_qa'), 'Use a dedicated *_schedule_qa database');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const prefix = `schedule_${randomUUID()}`;
  const operatorId = `${prefix}_operator`, sitterId = `${prefix}_sitter`, clientId = `${prefix}_client`, serviceCode = `${prefix}_walk`;
  const priorOperator = process.env.BUSINESS_OWNER_OPERATOR_USER_ID, priorSitter = process.env.BUSINESS_OWNER_SITTER_USER_ID;
  const secret = `${prefix}_secret`;
  const date = addCalendarDays(businessDateKey(), 10);
  const input = { clientId, serviceCode, schedule: { kind: 'TIMED_VISIT', visits: [{ date, startTime: '09:00', endTime: '09:30' }] } };
  const quote = (value) => quoteManualBooking({ db, actorId: operatorId, input: value, secret });
  const save = (value, token) => createManualBooking({ db, actorId: operatorId, input: value, token, secret });
  try {
    await db.$transaction(async (tx) => {
      await tx.user.createMany({ data: [{ id: operatorId, email: `${operatorId}@example.invalid`, role: 'OPERATOR' }, { id: sitterId, email: `${sitterId}@example.invalid`, role: 'SITTER' }] });
      await tx.client.create({ data: { id: clientId, name: 'Schedule QA client' } });
      await tx.service.create({ data: { code: serviceCode, name: 'QA walk', species: 'DOG', category: 'WALK', durationMinutes: 30, basePriceCents: 2500 } });
      // Establish client ownership without reserving the test interval.
      await tx.booking.create({ data: { clientId, operatorId, sitterId, startTime: businessWallTime(date, '07:00'), endTime: businessWallTime(date, '07:30'), status: 'CANCELED' } });
    });
    process.env.BUSINESS_OWNER_OPERATOR_USER_ID = operatorId; process.env.BUSINESS_OWNER_SITTER_USER_ID = sitterId;
    const reviewed = await quote(input);
    const race = await Promise.allSettled([
      save(input, reviewed.token),
      bookingTransaction(db, async (tx) => {
        const windows = [{ startTime: businessWallTime(date, '09:00'), endTime: businessWallTime(date, '09:30') }];
        // The exact availability and transaction boundary used by public creation.
        await assertBookingAvailability(tx, sitterId, windows);
        return tx.booking.create({ data: { clientId, operatorId, sitterId, ...windows[0], status: 'CONFIRMED',
          visits: { create: { operatorId, sitterId, date: businessWallTime(date, '00:00'), ...windows[0], status: 'CONFIRMED' } } } });
      }),
    ]);
    assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await db.visit.count({ where: { operatorId } }), 1);
    const replayInput = { ...input, schedule: { kind: 'TIMED_VISIT', visits: [{ date, startTime: '11:00', endTime: '11:30' }] } };
    const replayQuote = await quote(replayInput);
    const results = await Promise.all([save(replayInput, replayQuote.token), save(replayInput, replayQuote.token)]);
    assert.equal(results[0].bookingId, results[1].bookingId);
    assert.equal(await db.visit.count({ where: { bookingId: results[0].bookingId } }), 1);
    assert.equal(await db.bookingHistory.count({ where: { bookingId: results[0].bookingId } }), 1);
    // Conflicting new-client creation must leave no orphan Client.
    const newInput = { ...replayInput, clientId: null, client: { name: prefix } };
    const before = await db.client.count({ where: { name: prefix } });
    await assert.rejects(() => quote(newInput).then((result) => save(newInput, result.token)), (error) => error.code === 'SCHEDULE_CONFLICT');
    assert.equal(await db.client.count({ where: { name: prefix } }), before);
  } finally {
    try {
      await db.$transaction(async (tx) => {
        const bookings = { operatorId };
        await tx.bookingHistory.deleteMany({ where: { booking: bookings } });
        await tx.bookingLineItem.deleteMany({ where: { booking: bookings } });
        await tx.bookingPet.deleteMany({ where: { booking: bookings } });
        await tx.visit.deleteMany({ where: { operatorId } });
        await tx.booking.deleteMany({ where: bookings });
        await tx.client.deleteMany({ where: { OR: [{ id: clientId }, { name: prefix }] } });
        await tx.service.deleteMany({ where: { code: serviceCode } });
        await tx.user.deleteMany({ where: { id: { in: [operatorId, sitterId] } } });
      });
    } finally {
      if (priorOperator === undefined) delete process.env.BUSINESS_OWNER_OPERATOR_USER_ID; else process.env.BUSINESS_OWNER_OPERATOR_USER_ID = priorOperator;
      if (priorSitter === undefined) delete process.env.BUSINESS_OWNER_SITTER_USER_ID; else process.env.BUSINESS_OWNER_SITTER_USER_ID = priorSitter;
      await db.$disconnect();
    }
  }
});
