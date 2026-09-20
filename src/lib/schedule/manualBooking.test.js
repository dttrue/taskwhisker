import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualBooking, quoteManualBooking, normalizeManualInput, manualOptions } from './manualBooking.js';
import { scheduleAccess } from './access.js';
import { fixture, input, now, secret, ownerConfiguration } from './fixtures.js';
Object.assign(process.env, ownerConfiguration);
const quote = (db, value = input(), actorId = 'owner') => quoteManualBooking({ db, actorId, input: value, now, secret });
const save = (db, token, value = input(), actorId = 'owner') => createManualBooking({ db, actorId, input: value, token, secret });
const rejects = (fn, code) => assert.rejects(fn, (error) => error.code === code);

test('only the configured, role-validated owner pair may use the workflow', async () => {
  const { db, users } = fixture();
  assert.equal((await scheduleAccess(db, 'owner')).role, 'OPERATOR');
  assert.equal((await scheduleAccess(db, 'bridget')).role, 'SITTER');
  for (const actor of [null, '', 'outsider', 'unknown']) await rejects(() => quote(db, input(), actor), 'NOT_AUTHORIZED');
  users.bridget.role = 'OPERATOR';
  await rejects(() => quote(db), 'OWNER_SITTER_INVALID');
});
test('missing owner configuration fails closed', async () => {
  const original = process.env.BUSINESS_OWNER_SITTER_USER_ID;
  delete process.env.BUSINESS_OWNER_SITTER_USER_ID;
  try { await rejects(() => quote(fixture().db), 'OWNER_CONFIGURATION_MISSING'); }
  finally { process.env.BUSINESS_OWNER_SITTER_USER_ID = original; }
});
test('options scope clients through owned bookings', async () => {
  const { db, state, control } = fixture(); state.clients.push({ id: 'other', operatorId: 'outsider' });
  const options = await manualOptions(db, 'bridget');
  assert.deepEqual(options.clients.map((client) => client.id), ['client']);
  assert.equal(control.queries[0].where.bookings.some.operatorId, 'owner');
});
test('preview has no writes and ignores browser money and assignment', async () => {
  const { db, state } = fixture();
  const result = await quote(db, input({ clientTotalCents: 1, sitterId: 'outsider', operatorId: 'outsider' }));
  assert.equal(result.summary.clientTotalCents, 2500);
  assert.equal(result.summary.platformFeeCents, 250);
  assert.equal(state.bookings.length, 0);
});
test('creates confirmed visits, pricing, pet snapshots and actor history atomically', async () => {
  const { db, state, control } = fixture();
  control.pets = [{ id: 'pet', clientId: 'client', name: 'Milo', species: 'DOG' }];
  const value = input({ petIds: ['pet'], extras: [{ code: 'EXTRA', quantity: 2 }], schedule: { kind: 'TIMED_VISIT', visits: [
    { date: '2027-01-05', startTime: '09:00', endTime: '09:30' }, { date: '2027-01-06', startTime: '14:00', endTime: '14:30' },
  ] } });
  const result = await quote(db, value, 'bridget');
  assert.equal(result.summary.clientTotalCents, 6600);
  await save(db, result.token, value, 'bridget');
  assert.equal(state.bookings.length, 1); assert.equal(state.visits.length, 2);
  assert.equal(state.bookings[0].sitterId, 'bridget'); assert.equal(state.bookings[0].operatorId, 'owner');
  assert.equal(state.bookings[0].careInstructions, 'Use the side gate.');
  assert.equal(state.bookings[0].bookingPets.create[0].petId, 'pet');
  assert.equal(state.visits[0].startTime.toISOString(), '2027-01-05T14:00:00.000Z');
  assert.equal(state.visits[0].date.toISOString(), '2027-01-05T05:00:00.000Z');
  assert.equal(state.visits[0].status, 'CONFIRMED');
  assert.equal(state.history[0].changedByUserId, 'bridget');
  assert.equal(state.lineItems.length, 2);
  assert.equal(control.transactionOptions.isolationLevel, 'Serializable');
});
test('name-only client without pets is sufficient; existing client is not overwritten', async () => {
  const { db, state } = fixture();
  const value = input({ clientId: null, client: { name: 'New client' } });
  await save(db, (await quote(db, value)).token, value);
  assert.equal(state.clients.length, 2); assert.equal(state.clients[1].email, null);
  assert.deepEqual(state.bookings[0].petNames, []);
  assert.equal(state.clients[0].name, 'Alex');
});
test('existing client IDs, pets, email collisions and blocklist remain guarded', async () => {
  const { db, control, state } = fixture();
  state.clients.push({ id: 'foreign', operatorId: 'outsider' });
  await rejects(() => quote(db, input({ clientId: 'foreign' })), 'CLIENT_UNAVAILABLE');
  await rejects(() => quote(db, input({ petIds: ['foreign-pet'] })), 'PET_UNAVAILABLE');
  await rejects(() => quote(db, input({ clientId: null, client: { name: 'Alex', email: 'ALEX@example.invalid' } })), 'CLIENT_EXISTS');
  control.blocks = [{ id: 'blocked', email: 'alex@example.invalid' }];
  await rejects(() => quote(db), 'BLOCKED_CLIENT');
});
test('save rejects changed price, modified details, forged token, and another actor', async () => {
  const { db, services } = fixture(); const { token } = await quote(db);
  await rejects(() => save(db, token + 'x'), 'REVIEW_REQUIRED');
  await rejects(() => save(db, token, input({ notes: 'Changed' })), 'REVIEW_REQUIRED');
  await rejects(() => save(db, token, input(), 'bridget'), 'REVIEW_REQUIRED');
  await rejects(() => save(db, token, input(), 'outsider'), 'NOT_AUTHORIZED');
  services[0].basePriceCents++;
  await rejects(() => save(db, token), 'PRICE_CHANGED');
});
test('save revalidates account roles and selected service', async () => {
  const { db, services, users } = fixture(); const { token } = await quote(db);
  users.owner.role = 'SITTER'; await rejects(() => save(db, token), 'OWNER_OPERATOR_INVALID');
  users.owner.role = 'OPERATOR'; services[0].isActive = false;
  await rejects(() => save(db, token), 'SERVICE_UNAVAILABLE');
});
test('expired review and already-started care cannot be saved', async () => {
  const { db, control } = fixture(); const { token } = await quote(db);
  control.clock = new Date(+now + 1800001);
  await rejects(() => save(db, token), 'REVIEW_REQUIRED');
  await rejects(() => quoteManualBooking({ db, actorId: 'owner', input: input(), secret, now: new Date('2027-01-05T14:00:00Z') }), 'VISIT_ALREADY_STARTED');
});
test('same reviewed submission replays without duplicate clients, bookings, visits or history', async () => {
  const { db, state } = fixture(); const { token } = await quote(db);
  const first = await save(db, token); const second = await save(db, token);
  assert.deepEqual(first, second); assert.equal(state.bookings.length, 1); assert.equal(state.visits.length, 1); assert.equal(state.history.length, 1);
});
for (const failAt of ['booking', 'visits', 'lineItems', 'history']) test(`failure at ${failAt} rolls back new client and all booking writes`, async () => {
  const { db, control, state } = fixture(); const value = input({ clientId: null, client: { name: 'New' } });
  const { token } = await quote(db, value); control.failAt = failAt;
  await assert.rejects(() => save(db, token, value), /Injected/);
  assert.equal(state.clients.length, 1);
  for (const key of ['bookings', 'visits', 'history', 'lineItems']) assert.equal(state[key].length, 0);
});
test('transaction checks conflicts created after price preview and includes the local time', async () => {
  const { db, state } = fixture(); const { token } = await quote(db);
  state.visits.push({ id: 'conflict', sitterId: 'bridget', status: 'CONFIRMED', startTime: new Date('2027-01-05T14:40:00Z'), endTime: new Date('2027-01-05T15:10:00Z') });
  await assert.rejects(() => save(db, token), (error) => error.code === 'SCHEDULE_CONFLICT' && /9:40 AM/.test(error.message) && /Jan 5/.test(error.message));
  assert.equal(state.bookings.length, 0);
});
test('overnights use existing generation, nightly pricing, and actual cross-midnight intervals', async () => {
  const { db, state } = fixture(); const value = input({ serviceCode: 'STAY', schedule: { kind: 'OVERNIGHT_STAY', arrivalDate: '2027-03-13', departureDate: '2027-03-15', arrivalTime: '19:00', departureTime: '07:00' } });
  const result = await quote(db, value); assert.equal(result.summary.clientTotalCents, 12000);
  await save(db, result.token, value);
  assert.equal(state.visits.length, 2);
  assert.equal(state.visits[0].endTime - state.visits[0].startTime, 11 * 3600000);
});
test('invalid durations, dates, duplicate windows and excessive inputs are rejected', async () => {
  const { db } = fixture();
  for (const visit of [{ date: '2027-02-30', startTime: '09:00', endTime: '09:30' }, { date: '2027-01-05', startTime: '09:00', endTime: '10:00' }, { date: '2027-01-05', startTime: '06:30', endTime: '07:00' }]) {
    await rejects(() => quote(db, input({ schedule: { kind: 'TIMED_VISIT', visits: [visit] } })), 'INVALID_SCHEDULE');
  }
  const visit = input().schedule.visits[0];
  await rejects(() => quote(db, input({ schedule: { kind: 'TIMED_VISIT', visits: [visit, visit] } })), 'INVALID_SCHEDULE');
  assert.throws(() => normalizeManualInput(input({ extras: [{ code: 'EXTRA', quantity: -1 }] })), /quantities/);
});
