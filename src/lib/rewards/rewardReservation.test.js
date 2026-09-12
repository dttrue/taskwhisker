import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  reserveRewardForBookingWithDb as reserve,
  consumeRewardReservationWithDb as consume,
  releaseRewardReservationWithDb as release,
  RewardReservationError,
} from "./rewardReservationWrites.js";
import { REWARD_TRANSACTION_ATTEMPTS } from "./rewardProgressGrantWrites.js";

function fixture() {
  const state = {
    now: new Date("2026-09-12T12:00:00Z"),
    booking: { id: "booking", sitterId: "sitter", status: "CONFIRMED", completedAt: null, canceledAt: null,
      attributionSnapshot: { clientOriginKind: "SITTER_REFERRAL", compensationLane: "SITTER_ORIGINATED", referringSitterId: "sitter", requestedSitterId: "sitter" } },
    sitter: { id: "sitter", role: "SITTER" },
    account: { id: "account", sitterId: "sitter", currentGrantId: "grant", version: 1 },
    grant: { id: "grant", sitterId: "sitter", status: "ACTIVE", rewardLevel: 1, feeBasisPoints: 500, maximumUses: 10,
      startsAt: new Date("2026-09-01T00:00:00Z"), expiresAt: new Date("2026-10-01T00:00:00Z"),
      triggerEvent: { bookingId: "trigger", qualificationBookingId: "trigger", progressBookingId: "trigger" } },
    rows: [], calls: [], failAfterInsert: false,
  };
  let locked = false;
  const include = (row) => row ? structuredClone({ ...row, grant: state.grant }) : null;
  const tx = {
    async $queryRaw(strings, id) {
      const sql = strings.join("?");
      if (sql.includes('FROM "Booking"')) { assert.equal(id, "booking"); state.calls.push("bookingLock"); return [{ id }]; }
      if (sql.includes('FROM "SitterRewardAccount"')) {
        assert.equal(id, "sitter"); locked = true; state.calls.push("accountLock"); return state.account ? [{ id: "account" }] : [];
      }
      assert(sql.includes("clock_timestamp()")); assert(locked);
      state.calls.push("databaseClock"); return [{ now: state.now }];
    },
    booking: { async findUnique() { return structuredClone(state.booking); } },
    user: { async findUnique() { return structuredClone(state.sitter); } },
    sitterRewardAccount: {
      async findUnique() { return structuredClone(state.account); },
      async update({ data }) {
        assert(locked); state.calls.push("accountUpdate");
        state.account = { ...state.account, ...data, version: state.account.version + data.version.increment };
        return structuredClone(state.account);
      },
    },
    sitterRewardGrant: {
      async findUnique() { return structuredClone(state.grant); },
      async update({ data }) {
        assert(locked); assert.deepEqual(Object.keys(data), ["status"]);
        Object.assign(state.grant, data); return structuredClone(state.grant);
      },
    },
    sitterRewardReservation: {
      async findUnique({ where }) { return include(state.rows.find((r) => r.bookingId === where.bookingId)); },
      async count({ where }) {
        assert(locked); state.calls.push("count");
        assert.deepEqual(where, { grantId: "grant", status: { in: ["RESERVED", "CONSUMED"] } });
        return state.rows.filter((r) => r.grantId === where.grantId && where.status.in.includes(r.status)).length;
      },
      async create({ data }) {
        assert(locked); state.calls.push("insert");
        assert(!state.rows.some((r) => r.bookingId === data.bookingId));
        const row = { id: `reservation-${state.rows.length}`, consumedAt: null, releasedAt: null, releaseReason: null, ...data };
        state.rows.push(row);
        if (state.failAfterInsert) throw new Error("private database details");
        return include(row);
      },
      async update({ where, data }) {
        assert(locked);
        const row = state.rows.find((r) => r.id === where.id);
        Object.assign(row, data); return include(row);
      },
    },
  };
  const db = { ...tx, async $transaction(work, options) {
    assert.equal(options.isolationLevel, "Serializable");
    const before = structuredClone(state);
    locked = false;
    try { return await work(tx); } catch (error) { Object.assign(state, before); throw error; }
  } };
  return { state, db, reserve: () => reserve({ db, bookingId: "booking" }), consume: () => consume({ db, bookingId: "booking" }),
    release: (reason = "  Booking   canceled  ") => release({ db, bookingId: "booking", reason }) };
}

function occupy(state, count, status = "RESERVED") {
  for (let i = 0; i < count; i += 1) state.rows.push({ id: `old-${state.rows.length}`, bookingId: `old-${state.rows.length}`, grantId: "grant", sitterId: "sitter", status });
}

for (const status of ["REQUESTED", "CONFIRMED"]) {
  test(`${status} sitter-originated booking reserves with database time and frozen grant fee`, async () => {
    const f = fixture(); f.state.booking.status = status;
    const value = await f.reserve();
    assert.equal(value.status, "RESERVED"); assert.equal(value.reservation.status, "RESERVED");
    assert.equal(value.reservation.feeBasisPoints, 500); assert.equal(value.reservation.maximumUses, 10);
    assert.equal(value.reservation.sitterId, "sitter"); assert.equal(value.reservation.grantId, "grant");
    assert.deepEqual(value.reservation.reservedAt, f.state.now);
    assert.equal(value.reservation.consumedAt, null); assert.equal(value.reservation.releasedAt, null);
    assert.equal(f.state.rows.length, 1); assert.equal(f.state.account.currentGrantId, "grant");
    assert(f.state.calls.indexOf("accountLock") < f.state.calls.indexOf("count"));
    assert(f.state.calls.indexOf("count") < f.state.calls.indexOf("databaseClock"));
    assert(f.state.calls.indexOf("databaseClock") < f.state.calls.indexOf("insert"));
    assert.equal(f.state.account.version, 2);
  });
}

for (const [label, change, reason] of [
  ["missing booking", (s) => { s.booking = null; }, "BOOKING_NOT_FOUND"],
  ["business assigned", (s) => { s.booking.attributionSnapshot.compensationLane = "BUSINESS_ASSIGNED"; }, "NOT_SITTER_ORIGINATED"],
  ["missing attribution", (s) => { s.booking.attributionSnapshot = null; }, "ATTRIBUTION_SNAPSHOT_MISSING"],
  ["wrong origin", (s) => { s.booking.attributionSnapshot.clientOriginKind = "BUSINESS_ACQUIRED"; }, "NOT_SITTER_ORIGINATED"],
  ["referring/requested mismatch", (s) => { s.booking.attributionSnapshot.requestedSitterId = "other"; }, "SITTER_MISMATCH"],
  ["missing referring sitter", (s) => { s.booking.attributionSnapshot.referringSitterId = null; }, "SITTER_MISMATCH"],
  ["missing requested sitter", (s) => { s.booking.attributionSnapshot.requestedSitterId = null; }, "SITTER_MISMATCH"],
  ["reassigned booking", (s) => { s.booking.sitterId = "other"; }, "BOOKING_REASSIGNED"],
  ["unassigned booking", (s) => { s.booking.sitterId = null; }, "BOOKING_REASSIGNED"],
  ["missing sitter", (s) => { s.sitter = null; }, "INVALID_SITTER"],
  ["invalid sitter role", (s) => { s.sitter.role = "OPERATOR"; }, "INVALID_SITTER"],
  ["canceled booking", (s) => { s.booking.status = "CANCELED"; }, "BOOKING_CANCELED"],
  ["canceled timestamp", (s) => { s.booking.canceledAt = s.now; }, "BOOKING_CANCELED"],
  ["completed historical booking", (s) => { s.booking.status = "COMPLETED"; }, "BOOKING_NOT_RESERVABLE"],
  ["historical completion timestamp", (s) => { s.booking.completedAt = s.now; }, "BOOKING_NOT_RESERVABLE"],
  ["unknown lifecycle", (s) => { s.booking.status = "UNKNOWN"; }, "BOOKING_NOT_RESERVABLE"],
]) {
  test(`${label} is ineligible and writes nothing`, async () => {
    const f = fixture(); change(f.state);
    const before = structuredClone(f.state.account);
    const value = await f.reserve();
    assert.equal(value.status, "NOT_ELIGIBLE"); assert.equal(value.reasonCode, reason);
    assert.equal(value.reservation, null); assert.equal(f.state.rows.length, 0);
    assert.deepEqual(f.state.account, before);
  });
}

for (const field of ["bookingId", "qualificationBookingId", "progressBookingId"]) {
  test(`trigger booking is blocked through ${field} independently of lifecycle`, async () => {
    const f = fixture(); f.state.grant.triggerEvent[field] = "booking";
    assert.equal((await f.reserve()).reasonCode, "TRIGGER_BOOKING_NOT_ELIGIBLE");
    assert.equal(f.state.rows.length, 0);
  });
}

for (const [label, change, reason] of [
  ["no account", (s) => { s.account = null; }, "NO_REWARD_ACCOUNT"],
  ["no current pointer", (s) => { s.account.currentGrantId = null; }, "NO_CURRENT_GRANT"],
]) {
  test(`${label} returns normal no reward without creating an account`, async () => {
    const f = fixture(); change(f.state); const before = structuredClone(f.state.account);
    const value = await f.reserve(); assert.equal(value.status, "NO_REWARD_AVAILABLE");
    assert.equal(value.reasonCode, reason); assert.deepEqual(f.state.account, before);
  });
}

for (const offset of [0, 1]) {
  test(`ACTIVE expiry at boundary +${offset}ms refuses and normalizes`, async () => {
    const f = fixture(); f.state.now = new Date(f.state.grant.expiresAt.getTime() + offset);
    const value = await f.reserve(); assert.equal(value.reasonCode, "GRANT_EXPIRED");
    assert.equal(f.state.grant.status, "EXPIRED"); assert.equal(f.state.account.currentGrantId, null);
    assert.equal(f.state.rows.length, 0);
  });
}

for (const status of ["EXPIRED", "REVOKED", "EXHAUSTED"]) {
  test(`${status} stale pointer clears without reopening`, async () => {
    const f = fixture(); f.state.grant.status = status;
    assert.equal((await f.reserve()).reasonCode, `GRANT_${status}`);
    assert.equal(f.state.account.currentGrantId, null); assert.equal(f.state.grant.status, status);
  });
}

test("full ACTIVE grant normalizes EXHAUSTED without inserting", async () => {
  const f = fixture(); occupy(f.state, 10);
  assert.equal((await f.reserve()).reasonCode, "GRANT_EXHAUSTED");
  assert.equal(f.state.rows.length, 10); assert.equal(f.state.grant.status, "EXHAUSTED");
  assert.equal(f.state.account.currentGrantId, null);
});

for (const status of ["RESERVED", "CONSUMED"]) {
  test(`${status} counts toward capacity: tenth succeeds, closes grant, eleventh fails`, async () => {
    const f = fixture(); occupy(f.state, 9, status);
    assert.equal((await f.reserve()).status, "RESERVED"); assert.equal(f.state.rows.length, 10);
    assert.equal(f.state.grant.status, "EXHAUSTED"); assert.equal(f.state.account.currentGrantId, null);
    // Switch only the newly reserved fixture's key to simulate a fresh booking.
    f.state.rows.at(-1).bookingId = "previous";
    assert.equal((await f.reserve()).status, "NO_REWARD_AVAILABLE"); assert.equal(f.state.rows.length, 10);
  });
}

test("RELEASED does not count while ACTIVE and unexpired", async () => {
  const f = fixture(); occupy(f.state, 10, "RELEASED");
  assert.equal((await f.reserve()).status, "RESERVED"); assert.equal(f.state.grant.status, "ACTIVE");
  assert.equal(f.state.account.currentGrantId, "grant");
});

test("reserve retry returns identical entitlement even after eligibility/pointer changes", async () => {
  const f = fixture(); const first = await f.reserve();
  f.state.booking.status = "COMPLETED"; f.state.booking.sitterId = "other";
  f.state.booking.attributionSnapshot = null; f.state.sitter = null; f.state.account.currentGrantId = null;
  f.state.grant.status = "REVOKED";
  const next = await f.reserve(); assert.equal(next.status, "ALREADY_RESERVED");
  assert.deepEqual(next.reservation, first.reservation); assert.equal(f.state.rows.length, 1);
});

for (const status of ["EXPIRED", "EXHAUSTED", "REVOKED"]) {
  test(`consumption survives later ${status} and preserves identity/economics`, async () => {
    const f = fixture(); const first = await f.reserve(); f.state.grant.status = status;
    f.state.account.currentGrantId = null; f.state.now = new Date(f.state.grant.expiresAt.getTime() + 1);
    const value = await f.consume(); assert.equal(value.status, "CONSUMED");
    for (const key of ["id", "grantId", "sitterId", "reservedAt", "feeBasisPoints"]) assert.deepEqual(value.reservation[key], first.reservation[key]);
    assert.deepEqual(value.reservation.consumedAt, f.state.now); assert.equal(value.reservation.releasedAt, null);
    f.state.now = new Date(f.state.now.getTime() + 1000);
    const retry = await f.consume(); assert.equal(retry.status, "ALREADY_CONSUMED");
    assert.deepEqual(retry.reservation, value.reservation);
    assert.equal((await f.reserve()).status, "ALREADY_CONSUMED");
    assert.equal((await f.release()).reasonCode, "CONSUMED_CANNOT_RELEASE");
    assert.equal(f.state.rows.length, 1);
  });
}

test("reserve one millisecond before expiry freezes reward for post-expiry consumption", async () => {
  const f = fixture(); f.state.now = new Date(f.state.grant.expiresAt.getTime() - 1);
  const value = await f.reserve(); assert.equal(value.status, "RESERVED");
  f.state.now = new Date(f.state.grant.expiresAt.getTime() + 1);
  assert.equal((await f.consume()).status, "CONSUMED");
});

for (const status of ["ACTIVE", "EXPIRED", "EXHAUSTED"]) {
  test(`release after ${status} normalizes reason once and cannot resurrect`, async () => {
    const f = fixture(); const first = await f.reserve(); f.state.grant.status = status;
    if (status !== "ACTIVE") { f.state.now = new Date(f.state.grant.expiresAt.getTime() + 1); f.state.account.currentGrantId = null; }
    const value = await f.release(); assert.equal(value.status, "RELEASED");
    assert.equal(value.reservation.releaseReason, "Booking canceled");
    assert.deepEqual(value.reservation.releasedAt, f.state.now);
    assert.equal(value.reservation.consumedAt, null);
    assert.deepEqual(value.reservation.reservedAt, first.reservation.reservedAt);
    f.state.now = new Date(f.state.now.getTime() + 1000);
    const retry = await f.release("different reason"); assert.equal(retry.status, "ALREADY_RELEASED");
    assert.deepEqual(retry.reservation, value.reservation);
    assert.equal((await f.consume()).reasonCode, "RELEASED_CANNOT_CONSUME");
    assert.equal((await f.reserve()).status, "RESERVATION_RELEASED");
    assert.equal(f.state.grant.status, status);
  });
}

test("releasing the tenth reservation NEVER reopens the grant", async () => {
  const f = fixture(); occupy(f.state, 9); await f.reserve(); await f.release();
  assert.equal(f.state.grant.status, "EXHAUSTED"); assert.equal(f.state.account.currentGrantId, null);
  f.state.rows.at(-1).bookingId = "previous";
  assert.equal((await f.reserve()).status, "NO_REWARD_AVAILABLE");
});

test("releasing before exhaustion frees capacity for another booking", async () => {
  const f = fixture(); occupy(f.state, 8); await f.reserve(); await f.release();
  f.state.rows.at(-1).bookingId = "previous";
  assert.equal((await f.reserve()).status, "RESERVED");
  assert.equal(f.state.rows.filter((r) => r.status === "RESERVED").length, 9);
  assert.equal(f.state.grant.status, "ACTIVE"); assert.equal(f.state.account.currentGrantId, "grant");
});

for (const operation of ["consume", "release"]) {
  test(`${operation} missing reservation returns stable result`, async () => {
    const f = fixture(); assert.equal((await f[operation]()).status, "RESERVATION_NOT_FOUND");
    assert.equal(f.state.account.version, 1);
  });
}

for (const reason of ["", " \n\t ", null, 7]) {
  test(`invalid release reason ${JSON.stringify(reason)} fails before transaction`, async () => {
    await assert.rejects(release({ db: { $transaction() { assert.fail("must not transact"); } }, bookingId: "booking", reason }), { code: "INVALID_RELEASE_REASON" });
  });
}

test("server wrappers bind the real DB and allowlist only bookingId/reason", async () => {
  let source = await readFile(new URL("./rewardReservationService.js", import.meta.url), "utf8");
  assert(source.includes('import "server-only"')); assert(!source.includes('"use server"'));
  source = source.replace('import "server-only";', "").replace('import { prisma } from "../db.js";', 'const prisma = "trusted-db";')
    .replace(/import \{[\s\S]*?\} from "\.\/rewardReservationWrites.js";/,
      "const reserveRewardForBookingWithDb = async (input) => input; const consumeRewardReservationWithDb = reserveRewardForBookingWithDb; const releaseRewardReservationWithDb = reserveRewardForBookingWithDb;");
  const service = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const hostile = { bookingId: "booking", reason: "cancel", db: "evil", sitterId: "evil", grantId: "evil", rewardLevel: 9, feeBasisPoints: 0, maximumUses: 900,
    status: "CONSUMED", reservedAt: new Date(0), consumedAt: new Date(0), releasedAt: new Date(0), timestamps: {}, clock: () => new Date(0), compensationLane: "SITTER_ORIGINATED", capacity: 0 };
  assert.deepEqual(await service.reserveRewardForBooking(hostile), { db: "trusted-db", bookingId: "booking" });
  assert.deepEqual(await service.consumeRewardReservation(hostile), { db: "trusted-db", bookingId: "booking" });
  assert.deepEqual(await service.releaseRewardReservation(hostile), { db: "trusted-db", bookingId: "booking", reason: "cancel" });
});

test("WithDb also ignores caller clock and economic overrides", async () => {
  const f = fixture(); const value = await reserve({ db: f.db, bookingId: "booking", clock: () => new Date(0), sitterId: "evil", grantId: "evil", feeBasisPoints: 0, capacity: 0 });
  assert.equal(value.reservation.feeBasisPoints, 500); assert.deepEqual(value.reservation.reservedAt, f.state.now);
});

test("invalid input fails before transaction", async () => {
  for (const operation of [reserve, consume]) {
    await assert.rejects(operation(), { code: "INVALID_INPUT" });
    await assert.rejects(operation({ db: {}, bookingId: " " }), { code: "INVALID_INPUT" });
  }
});

for (const code of ["P2034", "40001", "40P01"]) {
  test(`${code} retries in a fresh Serializable transaction`, async () => {
    const f = fixture(); const original = f.db.$transaction; let attempts = 0;
    f.db.$transaction = (...args) => { if (++attempts === 1) throw { code }; return original(...args); };
    assert.equal((await f.reserve()).status, "RESERVED"); assert.equal(attempts, 2); assert.equal(f.state.rows.length, 1);
  });
}

test("retry exhaustion is bounded and sanitized", async () => {
  let attempts = 0;
  await assert.rejects(reserve({ bookingId: "booking", db: { $transaction() { attempts += 1; throw { code: "P2034" }; } } }), { code: "TRANSACTION_CONFLICT" });
  assert.equal(attempts, REWARD_TRANSACTION_ATTEMPTS);
});

test("a same-booking uniqueness conflict replays only its durable reservation", async () => {
  const f = fixture(); const first = await f.reserve();
  f.db.$transaction = () => { throw { code: "P2002" }; };
  const value = await f.reserve(); assert.equal(value.status, "ALREADY_RESERVED"); assert.deepEqual(value.reservation, first.reservation);
});

test("unrelated uniqueness failures are sanitized", async () => {
  const f = fixture(); f.db.$transaction = () => { throw { code: "P2002", message: "secret" }; };
  await assert.rejects(f.reserve(), { code: "PERSISTENCE_ERROR" });
});

test("failure after insert rolls back reservation/capacity and sanitizes internals", async () => {
  const f = fixture(); f.state.failAfterInsert = true;
  await assert.rejects(f.reserve(), (e) => e instanceof RewardReservationError && e.code === "PERSISTENCE_ERROR" && !e.message.includes("private"));
  assert.equal(f.state.rows.length, 0); assert.equal(f.state.account.version, 1); assert.equal(f.state.grant.status, "ACTIVE");
});

for (const change of [
  (s) => { s.grant.sitterId = "other"; }, (s) => { s.grant.maximumUses = 0; },
  (s) => { s.grant.feeBasisPoints = -1; }, (s) => { s.grant.expiresAt = new Date(NaN); },
  (s) => { s.grant.triggerEvent = null; }, (s) => { s.now = null; },
]) {
  test(`invalid grant/time state ${change.toString()} fails closed`, async () => {
    const f = fixture(); change(f.state);
    await assert.rejects(f.reserve(), { code: "INVALID_REWARD_STATE" }); assert.equal(f.state.rows.length, 0);
  });
}

test("future-start grant cannot accept early", async () => {
  const f = fixture(); f.state.now = new Date(f.state.grant.startsAt.getTime() - 1);
  assert.equal((await f.reserve()).reasonCode, "GRANT_NOT_STARTED"); assert.equal(f.state.rows.length, 0);
});
