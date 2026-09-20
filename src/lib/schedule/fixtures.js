// In-memory transaction double for local behavioral tests. PostgreSQL concurrency
// remains a separate integration check; this fixture does not simulate SSI.
export const now = new Date('2027-01-01T12:00:00Z');
export const secret = 'local-test-only-review-secret-1234';
export const ownerConfiguration = { BUSINESS_OWNER_OPERATOR_USER_ID: 'owner', BUSINESS_OWNER_SITTER_USER_ID: 'bridget' };
export function input(overrides = {}) {
  return { clientId: 'client', serviceCode: 'WALK', petIds: [], notes: 'Use the side gate.',
    schedule: { kind: 'TIMED_VISIT', visits: [{ date: '2027-01-05', startTime: '09:00', endTime: '09:30' }] }, ...overrides };
}
export function fixture() {
  const state = { clients: [{ id: 'client', name: 'Alex', email: 'alex@example.invalid', operatorId: 'owner' }], bookings: [], visits: [], history: [], lineItems: [] };
  const services = [
    { id: 'walk', code: 'WALK', name: 'Dog walk, 30 minutes', category: 'WALK', durationMinutes: 30, basePriceCents: 2500, isActive: true },
    { id: 'overnight', code: 'STAY', name: 'Overnight', category: 'OVERNIGHT', durationMinutes: null, basePriceCents: 6000, isActive: true },
    { id: 'extra', code: 'EXTRA', name: 'Extra pet', category: 'EXTRA', basePriceCents: 800, isActive: true },
  ];
  const users = { owner: { id: 'owner', role: 'OPERATOR' }, bridget: { id: 'bridget', role: 'SITTER', name: 'Bridget' }, outsider: { id: 'outsider', role: 'OPERATOR' } };
  const control = { clock: now, failAt: null, blocks: [], pets: [], attempts: 0, queries: [] };
  function clientMatch(client, where) {
    return (!where.id || where.id === client.id) && (!where.email || client.email?.toLowerCase() === where.email.equals.toLowerCase()) &&
      (!where.bookings || client.operatorId === where.bookings.some.operatorId);
  }
  function database(current) {
    return {
      user: { findUnique: async ({ where }) => users[where.id] || null },
      client: {
        findFirst: async ({ where }) => current.clients.find((client) => clientMatch(client, where)) || null,
        findMany: async (args) => { control.queries.push(args); return current.clients.filter((client) => clientMatch(client, args.where)); },
        create: async ({ data }) => { const client = { id: `client-${current.clients.length}`, ...data }; current.clients.push(client); return client; },
      },
      service: { findUnique: async ({ where }) => services.find((item) => item.code === where.code), findMany: async ({ where }) => services.filter((item) => !where.code || where.code.in.includes(item.code)) },
      blockedClient: { findMany: async () => control.blocks },
      pet: { findMany: async ({ where }) => control.pets.filter((pet) => where.id.in.includes(pet.id) && pet.clientId === where.clientId && !pet.archivedAt) },
      booking: {
        findUnique: async ({ where }) => current.bookings.find((booking) => booking.id === where.id) || null,
        create: async ({ data }) => { if (control.failAt === 'booking') throw new Error('Injected booking failure'); current.bookings.push(data); return data; },
      },
      visit: {
        findMany: async ({ where }) => { control.queries.push({ where }); return current.visits.filter((visit) => visit.sitterId === where.sitterId && where.status.in.includes(visit.status) && visit.startTime < where.startTime.lt && visit.endTime > where.endTime.gt); },
        createMany: async ({ data }) => { if (control.failAt === 'visits') throw new Error('Injected visit failure'); current.visits.push(...data); },
      },
      bookingHistory: { create: async ({ data }) => { if (control.failAt === 'history') throw new Error('Injected history failure'); current.history.push(data); } },
      bookingLineItem: { createMany: async ({ data }) => { if (control.failAt === 'lineItems') throw new Error('Injected line item failure'); current.lineItems.push(...data); } },
      $queryRaw: async () => [{ now: control.clock }],
    };
  }
  const db = { ...database(state), $transaction: async (work, options) => {
    control.attempts++;
    control.transactionOptions = options;
    const current = structuredClone(state);
    const result = await work(database(current));
    Object.assign(state, current);
    return result;
  } };
  return { db, state, services, control, users };
}
