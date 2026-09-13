import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { authenticateCanonicalQa, protectedState } from "../../../../scripts/canonical-booking-qa.mjs";
import { createCanonicalBookingWithDb } from "./createCanonicalBooking.js";
import { createBookingPricingSnapshotWithDb } from "./pricingSnapshot.js";
import { calculateCanonicalClientQuote } from "../../pricing/calculateCanonicalClientQuote.js";
import { createSitterReferralCode } from "../../referrals/sitterReferralCodeWrites.js";
import { bookingInput, optionFixture, petsFixture, timedSchedule, overnightSchedule } from "./fixtures.js";

// No test mutation before both real connection paths authenticate to disposable QA.
test("canonical PostgreSQL atomicity, pricing, attribution and retries", {
  skip: process.env.TASKWHISKER_CANONICAL_QA_TESTS !== "1", timeout: 240_000,
}, async (t) => {
  await authenticateCanonicalQa();
  const db = new PrismaClient();
  const marker = `canonical-qa-${randomUUID()}`, operatorId = `${marker}-operator`;
  const sitterId = `${marker}-default`, referralSitterId = `${marker}-referral`;
  const originalDefault = process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID;
  const baseline = await protectedState(db);
  const options = new Map();
  const before = async () => protectedState(db);
  const inputFor = (code = "DROP_IN_DOG_30", extras = {}) => bookingInput({
    client: { name: "Canonical QA", email: `${marker}@example.invalid` },
    careOptionCode: options.get(code).code,
    ...extras,
  });
  const create = (input = inputFor(), creationKey = randomUUID(), database = db) => createCanonicalBookingWithDb({ db: database, operatorId, creationKey, input });
  function injected(model, method, after = true) {
    return new Proxy(db, { get(target, property) {
      if (property === "$transaction") return (work, config) => target.$transaction((tx) => work(new Proxy(tx, {
        get(transaction, key) {
          if (key !== model) return transaction[key];
          return new Proxy(transaction[key], { get(delegate, operation) {
            if (operation !== method) return delegate[operation];
            return async (...args) => { if (after) await delegate[operation](...args); throw new Error("FORCED_QA_ROLLBACK"); };
          } });
        },
      })), config);
      return target[property];
    } });
  }
  try {
    process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID = sitterId;
    await db.user.createMany({ data: [
      { id: operatorId, role: "OPERATOR", email: `${operatorId}@example.invalid`, name: "QA Operator" },
      { id: sitterId, role: "SITTER", email: `${sitterId}@example.invalid`, name: "QA Default" },
      { id: referralSitterId, role: "SITTER", email: `${referralSitterId}@example.invalid`, name: "QA Referral" },
    ] });
    for (const code of ["DROP_IN_DOG_30", "DROP_IN_CAT_15", "DROP_IN_CAT_30", "DROP_IN_CAT_60", "DOG_WALK_15", "OVERNIGHT_DOG_HOME", "OVERNIGHT_CAT_HOME"]) {
      const f = optionFixture(code);
      const { id: _offeringId, speciesPolicies, ...offering } = f.offering;
      const { id: _rateId, petCharges, ...rate } = f.clientRate;
      const created = await db.careOption.create({ data: {
        id: `${marker}-${f.id}`, code: `${marker}-${code}`, label: f.label, primarySpecies: f.primarySpecies, durationMinutes: f.durationMinutes,
        offering: { create: { ...offering, code: `${marker}-${code}-offering`, speciesPolicies: { create: speciesPolicies } } },
        clientRate: { create: { ...rate, setByUserId: operatorId, petCharges: { create: petCharges } } },
      }, include: { offering: { include: { speciesPolicies: true } }, clientRate: { include: { petCharges: true } } } });
      options.set(code, created);
    }
    await t.test("canonical Booking, ordered pets, visits and both snapshots commit with null legacy money", async () => {
      const b = await create();
      assert.equal(b.status, "REQUESTED"); assert.equal(b.visits[0].status, "PENDING");
      assert.deepEqual([b.clientTotalCents, b.platformFeeCents, b.sitterPayoutCents], [null, null, null]);
      assert.equal(b.pricingSnapshot.clientTotalCents, 2750); assert.equal(b.pricingSnapshot.baseUnitCents, 2500);
      assert.equal(b.careOptionId, options.get("DROP_IN_DOG_30").id); assert.equal(b.careOptionCode, options.get("DROP_IN_DOG_30").code);
      assert.deepEqual([b.billingUnit, b.scheduleKind, b.quantity, b.scheduleTimeZone], ["VISIT", "TIMED_VISIT", 1, "America/New_York"]);
      assert.equal(b.bookingPets[0].speciesSnapshot, "Dog"); assert.equal(b.bookingPets[0].position, 0);
      assert(b.pricingSnapshot.committedAt instanceof Date);
      assert.equal(b.attributionSnapshot.clientOriginKind, "BUSINESS"); assert.equal(b.attributionSnapshot.attributionSource, "BUSINESS_DEFAULT");
      assert.equal(b.attributionSnapshot.compensationLane, "BUSINESS_ASSIGNED");
      assert.equal(b.attributionSnapshot.requestedSitterId, null);
      assert.equal(await db.bookingHistory.count({ where: { bookingId: b.id } }), 1);
    });
    await t.test("multi-pet three-visit pricing aggregates once and pets equal quote input", async () => {
      const pets = [{ name: "Milo", species: "Dog" }, { name: "Luna", species: "Dog" }];
      const b = await create(inputFor("DROP_IN_DOG_30", { pets, schedule: timedSchedule(3), quantity: 999, clientTotalCents: -1, committedAt: new Date(0) }));
      assert.equal(b.quantity, 3); assert.equal(b.visits.length, 3);
      assert.deepEqual(b.bookingPets.map((pet) => ({ name: pet.nameSnapshot, species: pet.speciesSnapshot })), pets);
      assert.deepEqual([b.pricingSnapshot.baseAggregateCents, b.pricingSnapshot.additionalPetAggregateCents, b.pricingSnapshot.serviceSubtotalCents, b.pricingSnapshot.clientTotalCents], [7500, 1500, 9000, 9900]);
      assert(b.pricingSnapshot.committedAt.getTime() > 0);
    });
    for (const [code, duration, base] of [["DROP_IN_CAT_15", 15, 2000], ["DROP_IN_CAT_30", 30, 2500], ["DROP_IN_CAT_60", 60, 3000], ["DOG_WALK_15", 15, 2200]]) await t.test(`${code} persists canonical example`, async () => {
      const b = await create(inputFor(code, { pets: petsFixture(code.includes("CAT") ? "Cat" : "Dog"), schedule: timedSchedule(1, duration) }));
      assert.equal(b.pricingSnapshot.baseUnitCents, base); assert.equal(b.durationMinutes, duration);
    });
    for (const [name, start, end, count] of [["one night", "2030-09-12", "2030-09-13", 1], ["two nights", "2030-09-12", "2030-09-14", 2], ["spring DST", "2030-03-09", "2030-03-11", 2], ["fall DST", "2030-11-02", "2030-11-04", 2]]) await t.test(`${name} mixed household persists cross-midnight visits`, async () => {
      const b = await create(inputFor("OVERNIGHT_DOG_HOME", { pets: petsFixture("Dog", "Dog", "Cat"), schedule: overnightSchedule(start, end) }));
      assert.equal(b.quantity, count); assert.equal(b.visits.length, count); assert.equal(b.pricingSnapshot.quantity, count);
      assert.equal(b.pricingSnapshot.baseAggregateCents, 6000 * count); assert.equal(b.pricingSnapshot.additionalPetAggregateCents, 2800 * count);
      assert.equal(b.pricingSnapshot.clientTotalCents, 9680 * count);
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: b.scheduleTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      for (const visit of b.visits) { assert.equal(fmt.format(visit.startTime), "19:00"); assert.equal(fmt.format(visit.endTime), "07:00"); assert(visit.startTime < visit.endTime); }
    });
    await t.test("Cat Overnight", async () => {
      const b = await create(inputFor("OVERNIGHT_CAT_HOME", { pets: petsFixture("Cat", "Cat"), schedule: overnightSchedule() }));
      assert.equal(b.pricingSnapshot.serviceSubtotalCents, 10000);
    });
    await t.test("exact retry after catalog edits returns original contract without re-quote", async () => {
      const input = inputFor(), key = randomUUID(); const b = await create(input, key);
      assert.deepEqual(await create(input, key), b);
      const option = options.get("DROP_IN_DOG_30");
      await db.clientCareRate.update({ where: { id: option.clientRate.id }, data: { baseRateCents: 9999, version: { increment: 1 } } });
      await db.careOption.update({ where: { id: option.id }, data: { isActive: false, label: "Changed" } });
      try {
        assert.deepEqual(await create(input, key), b);
        await assert.rejects(create({ ...input, pets: petsFixture("Dog", "Dog") }, key), { code: "IDEMPOTENCY_CONFLICT" });
      } finally {
        await db.clientCareRate.update({ where: { id: option.clientRate.id }, data: { baseRateCents: option.clientRate.baseRateCents, version: option.clientRate.version } });
        await db.careOption.update({ where: { id: option.id }, data: { isActive: true, label: option.label } });
      }
    });
    await t.test("concurrent same key creates exactly one Booking and snapshot", async () => {
      const key = randomUUID(), input = inputFor();
      const all = await Promise.all(Array.from({ length: 3 }, () => create(input, key)));
      assert.equal(new Set(all.map((b) => b.id)).size, 1);
      assert.equal(await db.booking.count({ where: { canonicalCreationKey: key } }), 1);
      assert.equal(await db.bookingPricingSnapshot.count({ where: { bookingId: all[0].id } }), 1);
    });
    await t.test("concurrent changed input loses with stable conflict, not Prisma error", async () => {
      const key = randomUUID();
      const results = await Promise.allSettled([create(inputFor(), key), create(inputFor("DROP_IN_DOG_30", { pets: petsFixture("Dog", "Dog") }), key)]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(results.find((r) => r.status === "rejected").reason.code, "IDEMPOTENCY_CONFLICT");
    });
    await t.test("direct snapshot writer concurrent replay is immutable and unique", async () => {
      const b = await create(), careOption = options.get("DROP_IN_DOG_30");
      const quote = calculateCanonicalClientQuote({ careOption, pets: petsFixture("Dog") });
      const run = () => db.$transaction((tx) => createBookingPricingSnapshotWithDb({ tx, bookingId: b.id, careOption, quote, quantity: 1 }));
      const results = await Promise.all([run(), run()]); assert.deepEqual(results[0], b.pricingSnapshot); assert.deepEqual(results[1], b.pricingSnapshot);
      assert.equal(await db.bookingPricingSnapshot.count({ where: { bookingId: b.id } }), 1);
    });
    await t.test("verified referral freezes sitter-originated attribution in the same transaction", async () => {
      const { publicCode } = await createSitterReferralCode({ db, sitterId: referralSitterId, operatorUserId: operatorId });
      const b = await create(inputFor("DROP_IN_DOG_30", { client: { name: "Referral QA", email: `${marker}-referral-client@example.invalid` }, referralCode: publicCode, requestReferringSitter: true }));
      assert.equal(b.sitterId, referralSitterId); assert.equal(b.attributionSnapshot.compensationLane, "SITTER_ORIGINATED");
      assert.equal(b.attributionSnapshot.attributionSource, "REFERRAL_LINK"); assert.equal(b.attributionSnapshot.referringSitterId, referralSitterId);
      assert.equal(b.attributionSnapshot.requestedSitterId, referralSitterId);
      await assert.rejects(create(inputFor("DROP_IN_DOG_30", { referralCode: publicCode })), { code: "CLIENT_ORIGIN_CONFLICT" });
    });
    await t.test("forged attribution and arbitrary sitter IDs cannot affect assignment", async () => {
      const b = await create({ ...inputFor(), requestedSitterId: referralSitterId, sitterId: referralSitterId, referringSitterId: referralSitterId, compensationLane: "SITTER_ORIGINATED", verifiedReferral: {} });
      assert.equal(b.sitterId, sitterId); assert.equal(b.attributionSnapshot.compensationLane, "BUSINESS_ASSIGNED");
      const state = await before();
      await assert.rejects(create(inputFor("DROP_IN_DOG_30", { referralCode: "forged-referral-code" })));
      assert.deepEqual(await before(), state);
    });
    for (const [name, model, method, after = true] of [
      ["Booking insert (including pets)", "booking", "create"],
      ["Visit creation", "visit", "createMany"],
      ["attribution creation", "bookingAttributionSnapshot", "create"],
      ["pricing snapshot preparation", "bookingPricingSnapshot", "create", false],
      ["pricing snapshot insert", "bookingPricingSnapshot", "create"],
    ]) await t.test(`forced failure after ${name} rolls back every participant`, async () => {
      const state = await before();
      const key = randomUUID(), input = inputFor("DROP_IN_DOG_30", { client: { name: "Rollback QA", email: `${marker}-${key}@example.invalid` } });
      await assert.rejects(create(input, key, injected(model, method, after)), /FORCED_QA_ROLLBACK/);
      assert.equal(await db.booking.count({ where: { canonicalCreationKey: key } }), 0);
      assert.deepEqual(await before(), state);
    });
    await t.test("invalid local DST time rolls back client and origin too", async () => {
      const state = await before();
      await assert.rejects(create(inputFor("OVERNIGHT_DOG_HOME", { client: { name: "DST QA", email: `${marker}-dst@example.invalid` }, schedule: { ...overnightSchedule("2030-03-09", "2030-03-11"), departureTime: "02:30" } })), { code: "INVALID_LOCAL_TIME" });
      assert.deepEqual(await before(), state);
    });
    await t.test("legacy Booking remains valid with unchanged money and no canonical contract", async () => {
      const client = await db.client.findFirst({ where: { email: `${marker}@example.invalid` } });
      const b = await db.booking.create({ data: { clientId: client.id, operatorId, sitterId, startTime: new Date("2030-01-01T12:00:00Z"), endTime: new Date("2030-01-01T12:30:00Z"), clientTotalCents: 2500, platformFeeCents: 250, sitterPayoutCents: 2250 } });
      assert.deepEqual([b.clientTotalCents, b.platformFeeCents, b.sitterPayoutCents, b.canonicalCreationKey, b.careOptionId], [2500, 250, 2250, null, null]);
      assert.equal(await db.bookingPricingSnapshot.count({ where: { bookingId: b.id } }), 0);
    });
  } finally {
    try {
      // Delete only records owned by the isolated fixture operator/client prefix.
      await db.$transaction(async (tx) => {
        const owned = await tx.booking.findMany({ where: { operatorId }, select: { id: true } });
        const bookingIds = owned.map((row) => row.id);
        await tx.bookingHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.visit.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
        await tx.clientOrigin.deleteMany({ where: { client: { email: { startsWith: marker } } } });
        await tx.client.deleteMany({ where: { email: { startsWith: marker } } });
        await tx.sitterReferralCode.deleteMany({ where: { sitterId: referralSitterId } });
        await tx.careOption.deleteMany({ where: { code: { startsWith: marker } } });
        await tx.careOffering.deleteMany({ where: { code: { startsWith: marker } } });
        await tx.user.deleteMany({ where: { id: { in: [operatorId, sitterId, referralSitterId] } } });
      }, { timeout: 30_000 });
      assert.deepEqual(await protectedState(db), baseline, "All protected counts and original legacy money must return to baseline.");
      t.diagnostic("Fixture cleanup verified: all 36 model counts and original legacy monetary values match baseline.");
    } finally {
      if (originalDefault === undefined) delete process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID;
      else process.env.DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID = originalDefault;
      await db.$disconnect();
    }
  }
});
