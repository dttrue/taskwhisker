import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceLoader } from '../bookings/surfaceTestSupport.js';

function publicFixture({ busy = false, retry = false } = {}) {
  const calls = { clientEmails: 0, sitterEmails: 0, prechecks: 0, transactionChecks: 0, attempts: 0, writes: 0 };
  const service = { id: 'walk', code: 'WALK', name: 'Walk', category: 'WALK', basePriceCents: 2500 };
  let booking, visits = [], items = [];
  const conflict = { id: 'other', sitterId: 'bridget', status: 'CONFIRMED', startTime: new Date('2027-01-05T14:00:00Z'), endTime: new Date('2027-01-05T14:30:00Z') };
  const tx = {
    client: { upsert: async () => { calls.writes++; return { id: 'client' }; } },
    booking: { create: async ({ data }) => { calls.writes++; booking = { id: 'booking', ...data }; return booking; }, findUnique: async () => ({ ...booking, clientLinkToken: 'link', client: { name: 'Alex', email: 'alex@example.invalid' }, sitter: { name: 'Bridget', email: 'bridget@example.invalid' }, visits, lineItems: items }) },
    visit: { findMany: async () => { calls.transactionChecks++; return busy ? [conflict] : []; }, create: async ({ data }) => { visits.push(data); return data; } },
    bookingLineItem: { createMany: async ({ data }) => { items.push(...data); } },
    bookingHistory: { create: async ({ data }) => { calls.history = data; } },
  };
  const db = {
    user: { findFirst: async () => ({ id: 'owner' }) },
    service: { findUnique: async () => service, findMany: async () => [{ code: 'EXTRA', name: 'Extra pet', basePriceCents: 800 }] },
    $transaction: async (work, options) => {
      calls.attempts++; calls.isolation = options.isolationLevel;
      visits = []; items = [];
      const result = await work(tx);
      if (retry && calls.attempts === 1) throw Object.assign(new Error('serialization'), { code: 'P2034' });
      return result;
    },
  };
  const dependencies = {
    '@/lib/bookings/resolveDefaultPublicBookingSitter': { resolveDefaultPublicBookingSitter: async () => ({ id: 'bridget' }) },
    '@/lib/calendar/checkAvailability': { checkAvailability: async () => { calls.prechecks++; return { valid: true }; } },
    '@/lib/blocklist/checkBlockedClient': { checkBlockedClient: async () => ({ blocked: false }) },
    '@/lib/geocodeAddress': { geocodeAddress: async () => { throw new Error('Unexpected geocoding'); } },
    '@/lib/messaging/createSystemMessage': { createSystemMessage: async () => {} },
    '@/lib/email/sendClientBookingConfirmationEmail': { sendClientBookingConfirmationEmail: async () => { calls.clientEmails++; } },
    '@/lib/email/sendSitterBookingNotificationEmail': { sendSitterBookingNotificationEmail: async () => { calls.sitterEmails++; } },
  };
  const { createPublicBooking } = surfaceLoader(null, 'owner', { db, dependencies }).load('app/book/actions.js');
  const input = { serviceCode: 'WALK', serviceType: 'WALK', basePriceCentsPerVisit: 3000,
    client: { name: 'Alex', email: 'alex@example.invalid' }, pets: [{ name: 'Milo', species: 'DOG' }],
    mode: 'MULTIPLE', dates: ['2027-01-05', '2027-01-06'], scheduleMode: 'SAME', startTime: '09:00', endTime: '09:30',
    addOns: [{ code: 'EXTRA', quantity: 2 }] };
  return { createPublicBooking, input, calls, conflict };
}

test('public success preserves pricing override, extras, confirmed visits, audit, and post-commit notifications', async () => {
  const { createPublicBooking, input, calls } = publicFixture({ retry: true });
  const result = await createPublicBooking(input);
  assert.equal(result.ok, true); assert.equal(result.booking.status, 'CONFIRMED');
  assert.deepEqual(result.booking.money, { clientTotalCents: 7600, platformFeeCents: 760, sitterPayoutCents: 6840 });
  assert.equal(result.booking.visits.length, 2); assert.equal(result.booking.lineItems.length, 2);
  assert.equal(calls.attempts, 2); assert.equal(calls.isolation, 'Serializable');
  assert.equal(calls.transactionChecks, 4); assert.equal(calls.prechecks, 2);
  assert.equal(calls.history.changedByUserId, null);
  assert.equal(calls.clientEmails, 1); assert.equal(calls.sitterEmails, 1);
});
test('public stale precheck cannot bypass transaction conflict; response shape and no-send behavior are preserved', async () => {
  const { createPublicBooking, input, calls, conflict } = publicFixture({ busy: true });
  const result = await createPublicBooking(input);
  assert.equal(result.ok, false); assert.equal(result.error, 'Selected time slot is no longer available.');
  assert.equal(result.reason, 'overlap'); assert.deepEqual(result.conflicts[0], { id: conflict.id, startTime: conflict.startTime, endTime: conflict.endTime, status: conflict.status });
  assert.equal(calls.writes, 0); assert.equal(calls.clientEmails, 0); assert.equal(calls.sitterEmails, 0);
});
