import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTRIBUTION_ERROR_CODES,
  AttributionContractError,
  CLIENT_IDENTITY_STATUS,
  buildBookingAttributionSnapshot,
  resolveBookingCompensationLane,
  resolveClientIdentityCandidates,
} from "./clientAttributionContract.js";
import {
  correctClientOrigin,
  createBookingAttributionSnapshot,
  createOrVerifyClientOrigin,
  resolveClientOriginWriteIntent,
  resolveRequestedSitter,
} from "./clientAttributionWrites.js";
import { hashPublicReferralCode } from "../referrals/sitterReferralCodeContract.js";
import { verifySitterReferralCode } from "../referrals/sitterReferralCodeWrites.js";

function assertCode(run, code) {
  assert.throws(run, (error) => {
    assert(error instanceof AttributionContractError);
    assert.equal(error.code, code);
    return true;
  });
}

async function assertRejectsCode(run, code) {
  await assert.rejects(run, (error) => {
    assert(error instanceof AttributionContractError);
    assert.equal(error.code, code);
    return true;
  });
}

function makeDb({
  users = [],
  clients = [],
  origins = [],
  bookings = [],
  snapshots = [],
  referralCodes = [],
  raceOrigin = null,
} = {}) {
  const state = {
    users: new Map(users.map((row) => [row.id, { ...row }])),
    clients: new Map(clients.map((row) => [row.id, { ...row }])),
    origins: new Map(origins.map((row) => [row.clientId, { ...row }])),
    events: [],
    bookings: new Map(bookings.map((row) => [row.id, { ...row }])),
    snapshots: new Map(snapshots.map((row) => [row.bookingId, { ...row }])),
    referralCodes: new Map(referralCodes.map((row) => [row.id, { ...row }])),
    raceOrigin,
    nextId: 1,
  };

  const db = {
    state,
    async $transaction(work) {
      return work(db);
    },
    client: {
      async findMany() {
        return [...state.clients.values()].map((row) => ({
          ...row,
          origin: state.origins.get(row.id) ?? null,
        }));
      },
      async findUnique({ where }) {
        const client = state.clients.get(where.id);
        if (!client) return null;
        return {
          ...client,
          origin: state.origins.get(client.id) ?? null,
        };
      },
    },
    user: {
      async findUnique({ where }) {
        return state.users.get(where.id) ?? null;
      },
    },
    clientOrigin: {
      async findUnique({ where }) {
        return state.origins.get(where.clientId) ?? null;
      },
      async create({ data }) {
        if (state.raceOrigin) {
          state.origins.set(data.clientId, { ...state.raceOrigin });
          state.raceOrigin = null;
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        if (state.origins.has(data.clientId)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const origin = {
          id: `origin-${state.nextId++}`,
          version: 1,
          ...data,
        };
        state.origins.set(data.clientId, origin);
        return origin;
      },
      async update({ where, data }) {
        const current = [...state.origins.values()].find(
          (origin) => origin.id === where.id,
        );
        const updated = {
          ...current,
          ...data,
          version:
            data.version?.increment != null
              ? current.version + data.version.increment
              : current.version,
        };
        state.origins.set(updated.clientId, updated);
        return updated;
      },
    },
    sitterReferralCode: {
      async findUnique({ where }) {
        const row = [...state.referralCodes.values()].find(
          (candidate) =>
            (where.id && candidate.id === where.id) ||
            (where.codeHash && candidate.codeHash === where.codeHash) ||
            (where.activeSitterKey &&
              candidate.activeSitterKey === where.activeSitterKey),
        );
        if (!row) return null;
        return {
          ...row,
          sitter: state.users.get(row.sitterId) ?? null,
        };
      },
    },
    clientOriginEvent: {
      async create({ data }) {
        const event = { id: `event-${state.nextId++}`, ...data };
        state.events.push(event);
        return event;
      },
    },
    booking: {
      async findUnique({ where }) {
        const booking = state.bookings.get(where.id);
        if (!booking) return null;
        return {
          id: booking.id,
          attributionSnapshot: state.snapshots.get(booking.id) ?? null,
        };
      },
    },
    bookingAttributionSnapshot: {
      async findUnique({ where }) {
        return state.snapshots.get(where.bookingId) ?? null;
      },
      async create({ data }) {
        if (state.snapshots.has(data.bookingId)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const snapshot = { id: `snapshot-${state.nextId++}`, ...data };
        state.snapshots.set(data.bookingId, snapshot);
        return snapshot;
      },
    },
  };

  return db;
}

const client = { id: "client-1", email: "client@example.com", phone: "2015550100" };
const clientB = {
  id: "client-2",
  email: "other@example.com",
  phone: "2015550199",
};
const sitterA = { id: "sitter-a", name: "Sarah", role: "SITTER" };
const sitterB = { id: "sitter-b", name: "Danny", role: "SITTER" };
const operator = { id: "operator-1", name: "Bridget", role: "OPERATOR" };
const referralCodeValues = new Map();

async function prepareVerifiedReferral(db, sitter) {
  let publicCode = referralCodeValues.get(sitter.id);
  if (!publicCode) {
    const fill = String.fromCharCode(65 + referralCodeValues.size);
    publicCode = fill.repeat(43);
    referralCodeValues.set(sitter.id, publicCode);
  }
  const id = `referral-${sitter.id}`;
  db.state.users.set(sitter.id, { ...sitter });
  db.state.referralCodes.set(id, {
    id,
    sitterId: sitter.id,
    codeHash: hashPublicReferralCode(publicCode),
    activeSitterKey: sitter.id,
    revokedAt: null,
  });
  return verifySitterReferralCode({ db, publicCode });
}

const referralOrigin = {
  id: "origin-referral",
  clientId: client.id,
  kind: "SITTER_REFERRAL",
  source: "REFERRAL_LINK",
  referringSitterId: sitterA.id,
  setByUserId: null,
  version: 1,
};

const businessOrigin = {
  id: "origin-business",
  clientId: client.id,
  kind: "BUSINESS",
  source: "BUSINESS_DEFAULT",
  referringSitterId: null,
  setByUserId: null,
  version: 1,
};

function snapshot(overrides = {}) {
  return {
    clientOriginKind: "SITTER_REFERRAL",
    attributionSource: "REFERRAL_LINK",
    referringSitterId: sitterA.id,
    referringSitterName: sitterA.name,
    requestedSitterId: sitterA.id,
    requestedSitterName: sitterA.name,
    compensationLane: "SITTER_ORIGINATED",
    ...overrides,
  };
}

async function prepareNewWriteIntent(db, verifiedReferral = null) {
  const trustedReferral = verifiedReferral
    ? await prepareVerifiedReferral(
        db,
        db.state.users.get(verifiedReferral.sitterId),
      )
    : null;
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: client.email,
    phone: client.phone,
    verifiedReferral: trustedReferral,
  });
  db.state.clients.set(client.id, { ...client });
  return intent;
}

test("new BUSINESS origin is created through the server-resolved contract", async () => {
  const db = makeDb();
  const intent = await prepareNewWriteIntent(db);
  const result = await createOrVerifyClientOrigin({
    db,
    clientId: client.id,
    intent,
  });
  assert.equal(result.created, true);
  assert.deepEqual(
    [result.origin.kind, result.origin.referringSitterId],
    ["BUSINESS", null],
  );
});

test("new verified SITTER_REFERRAL origin records the valid sitter", async () => {
  const db = makeDb({ users: [sitterA] });
  const intent = await prepareNewWriteIntent(db, {
    sitterId: sitterA.id,
    source: "REFERRAL_LINK",
  });
  const result = await createOrVerifyClientOrigin({
    db,
    clientId: client.id,
    intent,
  });
  assert.equal(result.origin.referringSitterId, sitterA.id);
});

test("browser-shaped referral cannot satisfy the write contract", async () => {
  const db = makeDb({ users: [sitterA] });
  await assert.rejects(
    () =>
      resolveClientOriginWriteIntent({
        db,
        email: client.email,
        phone: client.phone,
        verifiedReferral: {
          sitterId: sitterA.id,
          source: "REFERRAL_LINK",
        },
      }),
    (error) => error?.code === "INVALID_REFERRAL_CODE",
  );
});

test("existing matching origin replay is idempotent", async () => {
  const db = makeDb({
    clients: [client],
    origins: [referralOrigin],
    users: [sitterA],
  });
  const verifiedReferral = await prepareVerifiedReferral(db, sitterA);
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: client.email,
    phone: client.phone,
    verifiedReferral,
  });
  const result = await createOrVerifyClientOrigin({
    db,
    clientId: client.id,
    intent,
  });
  assert.deepEqual([result.created, result.idempotent], [false, true]);
  assert.equal(result.origin.version, 1);
});

test("BUSINESS origin cannot be replaced by referral replay", async () => {
  const db = makeDb({
    clients: [client],
    origins: [businessOrigin],
    users: [sitterA],
  });
  const verifiedReferral = await prepareVerifiedReferral(db, sitterA);
  await assertRejectsCode(
    () =>
      resolveClientOriginWriteIntent({
        db,
        email: client.email,
        phone: client.phone,
        verifiedReferral,
      }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
});

test("Sitter A origin cannot be replaced by Sitter B", async () => {
  const db = makeDb({
    clients: [client],
    origins: [referralOrigin],
    users: [sitterB],
  });
  const verifiedReferral = await prepareVerifiedReferral(db, sitterB);
  await assertRejectsCode(
    () =>
      resolveClientOriginWriteIntent({
        db,
        email: client.email,
        phone: client.phone,
        verifiedReferral,
      }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
});

test("operator correction appends before/after event and increments version", async () => {
  const db = makeDb({
    clients: [client],
    users: [operator, sitterA],
    origins: [businessOrigin],
  });
  const result = await correctClientOrigin({
    db,
    clientId: client.id,
    toKind: "SITTER_REFERRAL",
    toReferringSitterId: sitterA.id,
    source: "OPERATOR_VERIFIED",
    reason: "Correct documented intake attribution.",
    operatorUserId: operator.id,
  });
  assert.equal(result.origin.version, 2);
  assert.deepEqual(
    [result.event.fromKind, result.event.toKind, result.event.changedByUserId],
    ["BUSINESS", "SITTER_REFERRAL", operator.id],
  );
});

test("origin correction requires OPERATOR role", async () => {
  const db = makeDb({ clients: [client], users: [sitterA], origins: [businessOrigin] });
  await assertRejectsCode(
    () =>
      correctClientOrigin({
        db,
        clientId: client.id,
        toKind: "BUSINESS",
        source: "OPERATOR_VERIFIED",
        reason: "Correction",
        operatorUserId: sitterA.id,
      }),
    ATTRIBUTION_ERROR_CODES.OPERATOR_REQUIRED,
  );
});

test("origin correction requires a non-empty reason", async () => {
  const db = makeDb();
  await assertRejectsCode(
    () =>
      correctClientOrigin({
        db,
        clientId: client.id,
        toKind: "BUSINESS",
        source: "OPERATOR_VERIFIED",
        reason: "   ",
        operatorUserId: operator.id,
      }),
    ATTRIBUTION_ERROR_CODES.CORRECTION_REASON_REQUIRED,
  );
});

test("requested sitter is validated independently of client origin", async () => {
  const db = makeDb({ users: [sitterB] });
  assert.deepEqual(
    await resolveRequestedSitter({ db, requestedSitterId: sitterB.id }),
    sitterB,
  );
  await assertRejectsCode(
    () => resolveRequestedSitter({ db, requestedSitterId: "missing" }),
    ATTRIBUTION_ERROR_CODES.REQUESTED_SITTER_NOT_FOUND,
  );
});

test("requested sitter resolution does not mutate ClientOrigin", async () => {
  const db = makeDb({ users: [sitterB], origins: [referralOrigin] });
  await resolveRequestedSitter({ db, requestedSitterId: sitterB.id });
  assert.deepEqual(db.state.origins.get(client.id), referralOrigin);
});

test("SITTER_ORIGINATED requires referral=requested=assigned", () => {
  assert.equal(
    resolveBookingCompensationLane({
      clientOrigin: referralOrigin,
      requestedSitterId: sitterA.id,
      assignedSitterId: sitterA.id,
    }),
    "SITTER_ORIGINATED",
  );
});

test("assign-anyone resolves BUSINESS_ASSIGNED", () => {
  assert.equal(
    resolveBookingCompensationLane({
      clientOrigin: referralOrigin,
      requestedSitterId: null,
      assignedSitterId: sitterA.id,
    }),
    "BUSINESS_ASSIGNED",
  );
});

test("different assigned sitter resolves BUSINESS_ASSIGNED", () => {
  assert.equal(
    resolveBookingCompensationLane({
      clientOrigin: referralOrigin,
      requestedSitterId: sitterA.id,
      assignedSitterId: sitterB.id,
    }),
    "BUSINESS_ASSIGNED",
  );
});

test("requested sitter different from referrer resolves BUSINESS_ASSIGNED", () => {
  assert.equal(
    resolveBookingCompensationLane({
      clientOrigin: referralOrigin,
      requestedSitterId: sitterB.id,
      assignedSitterId: sitterB.id,
    }),
    "BUSINESS_ASSIGNED",
  );
});

test("snapshot freezes sitter display names without contact data", () => {
  assert.deepEqual(
    buildBookingAttributionSnapshot({
      clientOrigin: referralOrigin,
      referringSitter: sitterA,
      requestedSitter: sitterA,
      assignedSitter: sitterA,
    }),
    snapshot(),
  );
});

test("exact snapshot replay is idempotent", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  const first = await createBookingAttributionSnapshot({
    db,
    bookingId: "booking-1",
    snapshot: snapshot(),
  });
  const second = await createBookingAttributionSnapshot({
    db,
    bookingId: "booking-1",
    snapshot: snapshot(),
  });
  assert.deepEqual(
    [first.created, second.created, second.idempotent],
    [true, false, true],
  );
});

test("conflicting immutable snapshot replay is rejected", async () => {
  const db = makeDb({
    bookings: [{ id: "booking-1" }],
    snapshots: [{ id: "snapshot-1", bookingId: "booking-1", ...snapshot() }],
  });
  await assertRejectsCode(
    () =>
      createBookingAttributionSnapshot({
        db,
        bookingId: "booking-1",
        snapshot: snapshot({ compensationLane: "BUSINESS_ASSIGNED" }),
      }),
    ATTRIBUTION_ERROR_CODES.ATTRIBUTION_SNAPSHOT_CONFLICT,
  );
});

test("existing client without origin cannot be claimed by referral intent", async () => {
  const db = makeDb({ clients: [client], users: [sitterA] });
  const verifiedReferral = await prepareVerifiedReferral(db, sitterA);
  await assertRejectsCode(
    () =>
      resolveClientOriginWriteIntent({
        db,
        email: " CLIENT@example.com ",
        phone: null,
        verifiedReferral,
      }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
});

test("write boundary rejects a forged NEW referral intent for an existing client", async () => {
  const db = makeDb({ clients: [client], users: [sitterA] });
  await assertRejectsCode(
    () =>
      createOrVerifyClientOrigin({
        db,
        clientId: client.id,
        intent: {
          clientStatus: CLIENT_IDENTITY_STATUS.NEW,
          kind: "SITTER_REFERRAL",
          source: "REFERRAL_LINK",
          referringSitterId: sitterA.id,
        },
      }),
    ATTRIBUTION_ERROR_CODES.INVALID_INPUT,
  );
  assert.equal(db.state.origins.size, 0);
});

test("NEW referral intent for identity A cannot target unrelated Client B", async () => {
  const db = makeDb({ users: [sitterA] });
  const verifiedReferral = await prepareVerifiedReferral(db, sitterA);
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: client.email,
    phone: client.phone,
    verifiedReferral,
  });
  db.state.clients.set(clientB.id, { ...clientB });
  await assertRejectsCode(
    () => createOrVerifyClientOrigin({ db, clientId: clientB.id, intent }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
  assert.equal(db.state.origins.size, 0);
});

test("NEW business intent for identity A cannot target unrelated Client B", async () => {
  const db = makeDb();
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: client.email,
    phone: client.phone,
  });
  db.state.clients.set(clientB.id, { ...clientB });
  await assertRejectsCode(
    () => createOrVerifyClientOrigin({ db, clientId: clientB.id, intent }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
  assert.equal(db.state.origins.size, 0);
});

test("EXISTING intent cannot be reused with another clientId", async () => {
  const db = makeDb({ clients: [client], origins: [businessOrigin] });
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: client.email,
    phone: client.phone,
  });
  db.state.clients.set(clientB.id, { ...clientB });
  await assertRejectsCode(
    () => createOrVerifyClientOrigin({ db, clientId: clientB.id, intent }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
});

test("NEW intent succeeds for a created client with matching normalized identity", async () => {
  const db = makeDb();
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: " NewPerson@Example.COM ",
    phone: "(201) 555-0198",
  });
  const createdClient = {
    id: "client-new",
    email: "newperson@example.com",
    phone: "201-555-0198",
  };
  db.state.clients.set(createdClient.id, createdClient);
  const result = await createOrVerifyClientOrigin({
    db,
    clientId: createdClient.id,
    intent,
  });
  assert.equal(result.created, true);
});

test("NEW intent rejects when another Client now owns the resolved identity", async () => {
  const db = makeDb();
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: null,
    phone: client.phone,
  });
  db.state.clients.set(clientB.id, { ...clientB });
  db.state.clients.set(client.id, { ...client });
  await assertRejectsCode(
    () => createOrVerifyClientOrigin({ db, clientId: clientB.id, intent }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
  assert.equal(db.state.origins.size, 0);
});

test("NEW intent rejects ambiguous target plus competing identity match", async () => {
  const db = makeDb();
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: null,
    phone: client.phone,
  });
  db.state.clients.set(client.id, { ...client });
  db.state.clients.set(clientB.id, {
    ...clientB,
    phone: "(201) 555-0100",
  });
  await assertRejectsCode(
    () => createOrVerifyClientOrigin({ db, clientId: client.id, intent }),
    ATTRIBUTION_ERROR_CODES.CLIENT_IDENTITY_AMBIGUOUS,
  );
  assert.equal(db.state.origins.size, 0);
});

test("NEW intent rejects a created client with mismatched email", async () => {
  const db = makeDb();
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: client.email,
    phone: client.phone,
  });
  db.state.clients.set(client.id, {
    ...client,
    email: "different@example.com",
  });
  await assertRejectsCode(
    () => createOrVerifyClientOrigin({ db, clientId: client.id, intent }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
});

test("NEW intent rejects a created client with mismatched supplied phone", async () => {
  const db = makeDb();
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: client.email,
    phone: client.phone,
  });
  db.state.clients.set(client.id, { ...client, phone: "2015559999" });
  await assertRejectsCode(
    () => createOrVerifyClientOrigin({ db, clientId: client.id, intent }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
});

test("case and phone formatting normalization permit legitimate identity matching", async () => {
  const db = makeDb();
  const intent = await resolveClientOriginWriteIntent({
    db,
    email: " CLIENT@EXAMPLE.COM ",
    phone: "+1 (201) 555-0100",
  });
  db.state.clients.set(client.id, {
    ...client,
    email: "client@example.com",
    phone: "+1-201-555-0100",
  });
  const result = await createOrVerifyClientOrigin({
    db,
    clientId: client.id,
    intent,
  });
  assert.equal(result.created, true);
});

test("consumed NEW intent permits exact idempotent retry for the same client", async () => {
  const db = makeDb({ users: [sitterA] });
  const intent = await prepareNewWriteIntent(db, {
    sitterId: sitterA.id,
    source: "REFERRAL_LINK",
  });
  const first = await createOrVerifyClientOrigin({
    db,
    clientId: client.id,
    intent,
  });
  const second = await createOrVerifyClientOrigin({
    db,
    clientId: client.id,
    intent,
  });
  assert.deepEqual(
    [first.created, second.created, second.idempotent],
    [true, false, true],
  );
});

test("ambiguous email/phone identity requires operator review", () => {
  assertCode(
    () =>
      resolveClientIdentityCandidates({
        candidates: [
          { id: "client-email", email: "client@example.com", phone: null },
          { id: "client-phone", email: null, phone: "(201) 555-0100" },
        ],
        email: "client@example.com",
        phone: "2015550100",
      }),
    ATTRIBUTION_ERROR_CODES.CLIENT_IDENTITY_AMBIGUOUS,
  );
});

test("concurrent origin conflicts resolve deterministically through unique key", async () => {
  const db = makeDb({
    users: [sitterA, sitterB],
    raceOrigin: { ...referralOrigin, referringSitterId: sitterB.id },
  });
  const intent = await prepareNewWriteIntent(db, {
    sitterId: sitterA.id,
    source: "REFERRAL_LINK",
  });
  await assertRejectsCode(
    () =>
      createOrVerifyClientOrigin({
        db,
        clientId: client.id,
        intent,
      }),
    ATTRIBUTION_ERROR_CODES.CLIENT_ORIGIN_CONFLICT,
  );
  assert.equal(db.state.origins.get(client.id).referringSitterId, sitterB.id);
});

test("direct snapshot write rejects BUSINESS with SITTER_ORIGINATED lane", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  await assertRejectsCode(
    () =>
      createBookingAttributionSnapshot({
        db,
        bookingId: "booking-1",
        snapshot: snapshot({
          clientOriginKind: "BUSINESS",
          attributionSource: "BUSINESS_DEFAULT",
          referringSitterId: null,
          referringSitterName: null,
        }),
      }),
    ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
  );
});

test("direct snapshot write rejects BUSINESS with a referring sitter", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  await assertRejectsCode(
    () =>
      createBookingAttributionSnapshot({
        db,
        bookingId: "booking-1",
        snapshot: snapshot({
          clientOriginKind: "BUSINESS",
          attributionSource: "BUSINESS_DEFAULT",
          compensationLane: "BUSINESS_ASSIGNED",
        }),
      }),
    ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
  );
});

test("BUSINESS snapshot may freeze a requested sitter with BUSINESS_ASSIGNED", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  const value = {
    clientOriginKind: "BUSINESS",
    attributionSource: "BUSINESS_DEFAULT",
    referringSitterId: null,
    referringSitterName: null,
    requestedSitterId: sitterA.id,
    requestedSitterName: sitterA.name,
    compensationLane: "BUSINESS_ASSIGNED",
  };
  const result = await createBookingAttributionSnapshot({
    db,
    bookingId: "booking-1",
    snapshot: value,
  });
  assert.equal(result.created, true);
  assert.equal(result.snapshot.requestedSitterId, sitterA.id);
});

test("SITTER_ORIGINATED snapshot requires a referring sitter", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  await assertRejectsCode(
    () =>
      createBookingAttributionSnapshot({
        db,
        bookingId: "booking-1",
        snapshot: snapshot({
          referringSitterId: null,
          referringSitterName: null,
        }),
      }),
    ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
  );
});

test("SITTER_ORIGINATED snapshot requires a requested sitter", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  await assertRejectsCode(
    () =>
      createBookingAttributionSnapshot({
        db,
        bookingId: "booking-1",
        snapshot: snapshot({
          requestedSitterId: null,
          requestedSitterName: null,
        }),
      }),
    ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
  );
});

test("SITTER_ORIGINATED snapshot requires requested sitter to equal referrer", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  await assertRejectsCode(
    () =>
      createBookingAttributionSnapshot({
        db,
        bookingId: "booking-1",
        snapshot: snapshot({
          requestedSitterId: sitterB.id,
          requestedSitterName: sitterB.name,
        }),
      }),
    ATTRIBUTION_ERROR_CODES.INVALID_ATTRIBUTION_STATE,
  );
});

test("SITTER_REFERRAL with BUSINESS_ASSIGNED remains valid", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  const result = await createBookingAttributionSnapshot({
    db,
    bookingId: "booking-1",
    snapshot: snapshot({
      requestedSitterId: sitterB.id,
      requestedSitterName: sitterB.name,
      compensationLane: "BUSINESS_ASSIGNED",
    }),
  });
  assert.equal(result.created, true);
  assert.equal(result.snapshot.compensationLane, "BUSINESS_ASSIGNED");
});

test("valid builder output passes direct immutable snapshot persistence", async () => {
  const db = makeDb({ bookings: [{ id: "booking-1" }] });
  const built = buildBookingAttributionSnapshot({
    clientOrigin: referralOrigin,
    referringSitter: sitterA,
    requestedSitter: sitterA,
    assignedSitter: sitterA,
  });
  const result = await createBookingAttributionSnapshot({
    db,
    bookingId: "booking-1",
    snapshot: built,
  });
  assert.deepEqual(result.snapshot, {
    id: result.snapshot.id,
    bookingId: "booking-1",
    ...snapshot(),
  });
});
