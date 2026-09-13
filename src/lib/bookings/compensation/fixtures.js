import assert from "node:assert/strict";
import { optionFixture, bookingInput } from "../canonical/fixtures.js";
import { aggregateCanonicalQuote } from "../canonical/pricingSnapshot.js";
import { calculateCanonicalClientQuote } from "../../pricing/calculateCanonicalClientQuote.js";
import { commitBookingSitterCompensationWithDb } from "./commitBookingSitterCompensation.js";

export function compensationFixture({ business = false, quantity = 1, pets = bookingInput().pets, reward = null } = {}) {
  const now = new Date("2026-09-13T12:00:00Z"), option = optionFixture();
  const pricing = aggregateCanonicalQuote({ careOption: option, quote: calculateCanonicalClientQuote({ careOption: option, pets }), quantity });
  const booking = {
    id: "booking", operatorId: "operator", sitterId: "sitter", sitter: { id: "sitter", role: "SITTER" }, status: "CONFIRMED", canceledAt: null, completedAt: null,
    canonicalCreationKey: "canonical-creation-key", canonicalInputHash: "hash", careOptionId: option.id, careOptionCode: option.code,
    careOfferingId: option.offering.id, careOfferingCode: option.offering.code, quantity,
    billingUnit: "VISIT", scheduleKind: "TIMED_VISIT", durationMinutes: 30, scheduleTimeZone: "America/New_York", canonicalSchedule: bookingInput().schedule,
    clientTotalCents: null, platformFeeCents: null, sitterPayoutCents: null,
    bookingPets: pets.map((pet, position) => ({ position, nameSnapshot: pet.name, speciesSnapshot: pet.species })),
    pricingSnapshot: { id: "pricing", bookingId: "booking", ...pricing, committedAt: new Date("2026-09-12T12:00:00Z") },
    attributionSnapshot: { bookingId: "booking", clientOriginKind: business ? "BUSINESS" : "SITTER_REFERRAL", attributionSource: business ? "BUSINESS_DEFAULT" : "REFERRAL_LINK",
      compensationLane: business ? "BUSINESS_ASSIGNED" : "SITTER_ORIGINATED", referringSitterId: business ? null : "sitter", requestedSitterId: business ? null : "sitter" },
    visits: Array.from({ length: quantity }, (_, i) => ({ id: `visit-${i}`, bookingId: "booking", operatorId: "operator", sitterId: "sitter", status: "CONFIRMED", completedAt: null, performedBySitterId: null,
      startTime: new Date(`2030-09-${12 + i}T13:00:00Z`), endTime: new Date(`2030-09-${12 + i}T13:30:00Z`) })),
    sitterCompensation: null,
  };
  const state = {
    booking, now, calls: [], consumes: 0, fail: null,
    defaultRate: { id: "default-rate", careOptionId: option.id, version: 4, currency: "USD", isActive: true, baseCompensationCents: 2000, includedPetCount: 1, defaultAdditionalCents: 200,
      petCharges: [{ id: "pet-rule", species: "Dog", includedCount: 1, additionalCents: 400 }] },
    sitterRate: null,
    account: { id: "account", sitterId: "sitter", version: 1 },
    reservation: reward ? { id: "reservation", bookingId: "booking", sitterId: "sitter", grantId: "grant", status: reward,
      reservedAt: new Date("2026-09-12T13:00:00Z"), consumedAt: reward === "CONSUMED" ? new Date("2026-09-12T14:00:00Z") : null,
      releasedAt: reward === "RELEASED" ? new Date("2026-09-12T14:00:00Z") : null,
      grant: { id: "grant", sitterId: "sitter", feeBasisPoints: 500, rewardLevel: 1, status: "ACTIVE" } } : null,
  };
  const tx = {
    async $queryRaw(strings) { const sql = strings.join("?"); state.calls.push(sql); return sql.includes("clock_timestamp()") ? [{ now: state.now }] : [{ id: "locked" }]; },
    booking: { async findUnique() { return structuredClone(state.booking); } },
    sitterRewardReservation: {
      async findUnique() { return structuredClone(state.reservation); },
      async updateMany({ where, data }) {
        assert.equal(where.status, "RESERVED"); assert.equal(where.consumedAt, null); assert.equal(where.id, state.reservation.id);
        if (state.fail === "transitionCount") return { count: 0 };
        Object.assign(state.reservation, data); state.consumes++;
        if (state.fail === "afterConsume") throw new Error("private forced failure");
        return { count: 1 };
      },
    },
    sitterRewardAccount: {
      async findUnique() { return structuredClone(state.account); },
      async update() { state.account.version++; return structuredClone(state.account); },
    },
    defaultSitterCareRate: { async findUnique() { state.calls.push("defaultRate"); return structuredClone(state.defaultRate); } },
    sitterCareRate: { async findUnique() { state.calls.push("sitterRate"); return structuredClone(state.sitterRate); } },
    bookingSitterCompensation: { async create({ data }) {
      assert.equal(state.booking.sitterCompensation, null);
      const { petCharges, ...scalars } = data;
      const row = { id: "compensation", ...scalars, createdAt: state.now, petCharges: petCharges.create.map((p, i) => ({ id: `pet-${i}`, compensationId: "compensation", ...p })) };
      state.booking.sitterCompensation = structuredClone(row);
      if (state.fail === "afterInsert") throw new Error("private forced failure");
      return structuredClone(row);
    } },
  };
  const db = { async $transaction(work, config) {
    assert.equal(config.isolationLevel, "Serializable");
    const before = structuredClone(state);
    try { return await work(tx); } catch (error) { Object.assign(state, before); throw error; }
  } };
  return { state, db, commit: (noise = {}) => commitBookingSitterCompensationWithDb({ ...noise, db, bookingId: "booking" }) };
}
