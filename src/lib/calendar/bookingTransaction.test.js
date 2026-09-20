import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingTransaction, assertBookingAvailability } from './bookingTransaction.js';
import { checkAvailabilityWithDb } from './availabilityContract.js';
const startTime = new Date('2027-01-05T14:00:00Z'), endTime = new Date('2027-01-05T14:30:00Z');

test('shared public/manual availability preserves pending/confirmed states and 15-minute buffer', async () => {
  let query;
  const db = { visit: { findMany: async (args) => { query = args; return []; } } };
  assert.deepEqual(await checkAvailabilityWithDb(db, { sitterId: 'bridget', startTime, endTime }), { valid: true });
  assert.deepEqual(query.where.status.in, ['CONFIRMED', 'PENDING']);
  assert.equal(query.where.startTime.lt.toISOString(), '2027-01-05T14:45:00.000Z');
  assert.equal(query.where.endTime.gt.toISOString(), '2027-01-05T13:45:00.000Z');
});
test('all windows are checked inside callback before writes; conflicts abort', async () => {
  let written = false, checked = false;
  const tx = { visit: { findMany: async () => { checked = true; return [{ id: 'busy', startTime, endTime }]; } } };
  const db = { $transaction: async (work) => work(tx) };
  await assert.rejects(() => bookingTransaction(db, async (transaction) => {
    await assertBookingAvailability(transaction, 'bridget', [{ startTime, endTime }]); written = true;
  }), (error) => error.code === 'SCHEDULE_CONFLICT');
  assert.equal(checked, true); assert.equal(written, false);
});
test('Serializable retry reruns authoritative check after a serialization failure', async () => {
  let attempts = 0, checks = 0;
  const db = { $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable'); attempts++;
    const result = await work({ visit: { findMany: async () => { checks++; return []; } } });
    if (attempts === 1) throw Object.assign(new Error('serialization'), { code: 'P2034' });
    return result;
  } };
  await bookingTransaction(db, async (tx) => assertBookingAvailability(tx, 'bridget', [{ startTime, endTime }]));
  assert.equal(attempts, 2); assert.equal(checks, 2);
});
test('retries are bounded and unrelated errors do not retry', async () => {
  for (const code of ['P2034', 'P2002', 'OTHER']) {
    let count = 0;
    await assert.rejects(() => bookingTransaction({ $transaction: async () => { count++; throw Object.assign(new Error('failure'), { code }); } }, () => {}));
    assert.equal(count, code === 'P2034' ? 3 : 1);
  }
});
test('buffer is elapsed time across DST even when server uses New York time', async () => {
  const original = process.env.TZ; process.env.TZ = 'America/New_York';
  try {
    let query;
    const db = { visit: { findMany: async (args) => { query = args; return []; } } };
    await checkAvailabilityWithDb(db, { sitterId: 'bridget', startTime: new Date('2027-03-14T07:00:00Z'), endTime: new Date('2027-03-14T07:30:00Z') });
    assert.equal(query.where.endTime.gt.toISOString(), '2027-03-14T06:45:00.000Z');
    assert.equal(query.where.startTime.lt.toISOString(), '2027-03-14T07:45:00.000Z');
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
