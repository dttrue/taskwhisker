// Synthetic fixtures; invoked only after disposable-QA authentication.
import { randomUUID } from 'node:crypto';
import { optionFixture, bookingInput, timedSchedule } from '../bookings/canonical/fixtures.js';
import { createCanonicalBookingWithDb } from '../bookings/canonical/createCanonicalBooking.js';
import { confirmBookingWithDb } from '../bookings/confirmation/confirmationService.js';
import { handoffSelectedVisitsWithDb } from '../bookings/handoff/handoffService.js';
import { cleanupVisitFinance } from '../../../scripts/visit-compensation-qa.mjs';
export async function setupMessagingFixtures(db) {
  const marker = `messages-qa-${randomUUID()}`;
  const identities = Object.fromEntries(['operator', 'lead', 'riley', 'bob', 'outsider', 'owner'].map(key => [key, `${marker}-${key}`]));
  const saved = Object.fromEntries(['BUSINESS_OWNER_OPERATOR_USER_ID', 'BUSINESS_OWNER_SITTER_USER_ID', 'DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID'].map(k => [k, process.env[k]]));
  const state = { marker, identities, saved, bookingIds: [], option: null, ordinal: 0 };
  try {
    await db.user.createMany({ data: Object.entries(identities).map(([key, id]) => ({ id, email: `${id}@example.invalid`, name: { operator: 'Morgan', lead: 'Avery', riley: 'Riley', bob: 'Bob', outsider: 'Taylor', owner: 'Casey' }[key], role: key === 'operator' ? 'OPERATOR' : 'SITTER' })) });
    process.env.BUSINESS_OWNER_OPERATOR_USER_ID = identities.operator;
    process.env.BUSINESS_OWNER_SITTER_USER_ID = identities.owner;
    process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID = identities.lead;
    const f = optionFixture(), { id: _offeringId, speciesPolicies, ...offering } = f.offering, { id: _rateId, petCharges, ...rate } = f.clientRate;
    state.option = await db.careOption.create({ data: { code: `${marker}-option`, label: 'Dog drop-in · 30 minutes', primarySpecies: 'Dog', durationMinutes: 30,
      offering: { create: { ...offering, code: `${marker}-offering`, speciesPolicies: { create: speciesPolicies } } },
      clientRate: { create: { ...rate, setByUserId: identities.operator, petCharges: { create: petCharges } } },
      defaultSitterRate: { create: { baseCompensationCents: 2000, version: 1, setByUserId: identities.operator, petCharges: { create: [{ species: 'Dog', includedCount: 1, additionalCents: 400 }] } } },
    } });
    return state;
  } catch (error) { await cleanupMessagingFixtures(db, state); throw error; }
}
export async function messagingBooking(db, state, quantity = 2) {
  const schedule = timedSchedule(quantity), offset = ++state.ordinal * 7 * 86400000;
  schedule.visits = schedule.visits.map(v => ({ ...v, date: new Date(Date.parse(`${v.date}T00:00:00Z`) + offset).toISOString().slice(0, 10) }));
  const booking = await createCanonicalBookingWithDb({ db, operatorId: state.identities.operator, creationKey: randomUUID(), input: bookingInput({
    client: { name: 'Morgan Example', email: `${state.marker}-${randomUUID()}@example.invalid` },
    pets: [{ name: 'QA Biscuit', species: 'Dog' }], careOptionCode: state.option.code, schedule,
    notes: 'Refresh water. Give one cup of kibble after the walk.',
    location: { addressLine1: '123 Example Lane', city: 'Exampletown', state: 'NY', postalCode: '10001', country: 'US', accessInstructions: 'Use the side entrance. Synthetic review fixture.' },
  }) });
  state.bookingIds.push(booking.id);
  const result = await confirmBookingWithDb({ db, bookingId: booking.id, actorId: state.identities.operator });
  if (!result.ok) throw new Error('Synthetic booking confirmation failed.');
  return db.booking.findUnique({ where: { id: booking.id }, include: { visits: { orderBy: { canonicalUnitPosition: 'asc' } } } });
}
export const messagingHandoff = (db, state, booking, sitterId, visitIds = [booking.visits[0].id], operationId = randomUUID()) => handoffSelectedVisitsWithDb({ db, bookingId: booking.id, actorId: state.identities.operator, sitterId, visitIds, operationId, requireCareSnapshot: true });
export async function cleanupMessagingFixtures(db, state) {
  const ids = state.identities;
  try {
    await db.$transaction(async tx => {
      const bookings = await tx.booking.findMany({ where: { operatorId: ids.operator }, select: { id: true, clientId: true } });
      const bookingIds = bookings.map(b => b.id);
      const clients = await tx.client.findMany({ where: { id: { in: bookings.map(b => b.clientId) }, email: { startsWith: state.marker } }, select: { id: true } });
      const clientIds = clients.map(c => c.id);
      await tx.conversation.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await cleanupVisitFinance(tx, bookingIds);
      await tx.bookingSitterCompensationPetCharge.deleteMany({ where: { compensation: { bookingId: { in: bookingIds } } } });
      await tx.bookingSitterCompensation.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.visit.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.bookingHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
      await tx.clientOrigin.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.client.deleteMany({ where: { id: { in: clientIds } } });
      if (state.option) { await tx.careOption.delete({ where: { id: state.option.id } }); await tx.careOffering.delete({ where: { id: state.option.offeringId } }); }
      await tx.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    }, { timeout: 30000 });
  } finally { for (const [key, value] of Object.entries(state.saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
