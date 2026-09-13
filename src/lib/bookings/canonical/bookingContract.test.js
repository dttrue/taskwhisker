import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeBookingIntent, normalizeSchedule, deriveSchedule, businessWallTime } from "./bookingContract.js";
import { aggregateCanonicalQuote, createBookingPricingSnapshotWithDb } from "./pricingSnapshot.js";
import { calculateCanonicalClientQuote } from "../../pricing/calculateCanonicalClientQuote.js";
import { optionFixture, petsFixture, bookingInput, overnightSchedule, timedSchedule } from "./fixtures.js";
import { resolveClientOriginWriteIntent, createOrVerifyClientOriginInTransaction } from "../../attribution/clientAttributionWrites.js";
const normalized = (input) => normalizeBookingIntent(input, "operator");
const windows = (schedule, code = "OVERNIGHT_DOG_HOME") => deriveSchedule(normalizeSchedule(schedule), optionFixture(code));
function priced(code, species, quantity = 1) {
  const careOption = optionFixture(code), quote = calculateCanonicalClientQuote({ careOption, pets: petsFixture(...species) });
  return { careOption, quote, quantity };
}
const examples = [
  ["Dog Drop-In 30 one Dog", "DROP_IN_DOG_30", ["Dog"], 1, 2500, 0],
  ["Dog Drop-In 30 two Dogs", "DROP_IN_DOG_30", ["Dog", "Dog"], 1, 2500, 500],
  ["Cat Drop-In 15 multi-cat", "DROP_IN_CAT_15", ["Cat", "Cat", "Cat"], 1, 2000, 600],
  ["Cat Drop-In 30", "DROP_IN_CAT_30", ["Cat"], 1, 2500, 0],
  ["Cat Drop-In 60", "DROP_IN_CAT_60", ["Cat"], 1, 3000, 0],
  ["Dog Walk 15", "DOG_WALK_15", ["Dog"], 1, 2200, 0],
  ["Dog Overnight mixed household", "OVERNIGHT_DOG_HOME", ["Dog", "Dog", "Cat"], 1, 6000, 2800],
  ["two-night Dog Overnight", "OVERNIGHT_DOG_HOME", ["Dog", "Dog", "Cat"], 2, 6000, 5600],
  ["Cat Overnight", "OVERNIGHT_CAT_HOME", ["Cat", "Cat"], 1, 4200, 800],
  ["three visits scale once", "DROP_IN_DOG_30", ["Dog", "Dog"], 3, 2500, 1500],
];
for (const [name, code, species, quantity, base, additional] of examples) test(name, () => {
  const result = aggregateCanonicalQuote(priced(code, species, quantity));
  assert.equal(result.quantity, quantity); assert.equal(result.baseUnitCents, base);
  assert.equal(result.baseAggregateCents, base * quantity); assert.equal(result.additionalPetAggregateCents, additional);
  assert.equal(result.serviceSubtotalCents, base * quantity + additional);
  assert.equal(result.clientFeeCents, Math.floor((result.serviceSubtotalCents + 5) / 10));
  assert.equal(result.clientTotalCents, result.serviceSubtotalCents + result.clientFeeCents);
  assert.equal(result.currency, "USD"); assert.equal(result.clientFeeBasisPoints, 1000);
  assert.equal(result.breakdown.reduce((sum, entry) => sum + entry.amountCents, 0), result.serviceSubtotalCents);
});
test("identity, billing unit, schedule, duration and real rate version are frozen", () => {
  const args = priced("DROP_IN_DOG_30", ["Dog"]), s = aggregateCanonicalQuote(args);
  assert.deepEqual([s.careOptionId, s.careOptionCode, s.billingUnit, s.scheduleKind, s.durationMinutes, s.clientRateVersion], [args.careOption.id, args.careOption.code, "VISIT", "TIMED_VISIT", 30, 2]);
  args.careOption.clientRate.baseRateCents = 9000; assert.equal(s.baseUnitCents, 2500);
});
test("ordered normalized pets are preserved and order changes hash", () => {
  const input = bookingInput({ pets: [{ name: " Milo ", species: "Dog" }, { name: "Luna", species: "Dog" }] });
  const first = normalized(input); assert.deepEqual(first.intent.pets, [{ name: "Milo", species: "Dog" }, { name: "Luna", species: "Dog" }]);
  assert.notEqual(first.inputHash, normalized({ ...input, pets: [...input.pets].reverse() }).inputHash);
});
test("caller money, quantity, clock, versions, currency and forged attribution do not influence intent", () => {
  const input = bookingInput(), clean = normalized(input);
  assert.deepEqual(normalized({ ...input, quantity: 999, baseUnitCents: -1, subtotal: 99, currency: "EUR", pricingVersion: 22, committedAt: "1900", sitterId: "forged", requestedSitterId: "forged", compensationLane: "SITTER_ORIGINATED", referringSitterId: "forged" }), clean);
});
test("equivalent schedules hash identically independent of object and visit order", () => {
  const input = bookingInput({ schedule: timedSchedule(3) });
  const other = { ...input, schedule: { visits: [...input.schedule.visits].reverse(), kind: "TIMED_VISIT" } };
  assert.equal(normalized(input).inputHash, normalized(other).inputHash);
  assert.match(normalized(input).inputHash, /^[a-f0-9]{64}$/);
});
test("hash binds trusted operator and contact/location choices", () => {
  const input = bookingInput();
  assert.notEqual(normalized(input).inputHash, normalizeBookingIntent(input, "another").inputHash);
  assert.notEqual(normalized(input).inputHash, normalized({ ...input, location: { city: "Changed" } }).inputHash);
});
for (const n of [1, 3]) test(`${n} daytime visits derive quantity ${n}`, () => assert.equal(windows(timedSchedule(n), "DROP_IN_DOG_30").quantity, n));
for (const n of [1, 2]) test(`${n} nights create ${n} cross-midnight Visits`, () => {
  const s = windows(overnightSchedule("2030-09-12", `2030-09-${12 + n}`));
  assert.equal(s.quantity, n); assert.equal(s.windows.length, n);
  assert.equal(s.windows[0].startTime.toISOString(), "2030-09-12T23:00:00.000Z");
  assert.equal(s.windows[0].endTime.toISOString(), "2030-09-13T11:00:00.000Z");
});
for (const [name, start, end, expected] of [
  ["spring", "2030-03-09", "2030-03-11", [["2030-03-10T00:00:00.000Z", "2030-03-10T11:00:00.000Z"], ["2030-03-10T23:00:00.000Z", "2030-03-11T11:00:00.000Z"]]],
  ["fall", "2030-11-02", "2030-11-04", [["2030-11-02T23:00:00.000Z", "2030-11-03T12:00:00.000Z"], ["2030-11-04T00:00:00.000Z", "2030-11-04T12:00:00.000Z"]]],
]) test(`DST ${name}: two nights, correct per-date UTC offsets and local wall times`, () => {
  const s = windows(overnightSchedule(start, end)); assert.equal(s.quantity, 2);
  assert.deepEqual(s.windows.map((w) => [w.startTime.toISOString(), w.endTime.toISOString()]), expected);
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const w of s.windows) { assert.equal(f.format(w.startTime), "19:00"); assert.equal(f.format(w.endTime), "07:00"); }
});
for (const [date, time] of [["2030-03-10", "02:30"], ["2030-11-03", "01:30"]]) test(`DST invalid/ambiguous ${date} ${time} is rejected`, () => assert.throws(() => businessWallTime(date, time), { code: "INVALID_LOCAL_TIME" }));
for (const [name, schedule, code = "OVERNIGHT_DOG_HOME"] of [
  ["zero nights", overnightSchedule("2030-09-12", "2030-09-12")],
  ["reversed nights", overnightSchedule("2030-09-14", "2030-09-12")],
  ["malformed date", overnightSchedule("2030-02-30", "2030-03-02")],
  ["invalid time", { ...overnightSchedule(), arrivalTime: "25:00" }],
  ["daytime reversed time", { kind: "TIMED_VISIT", visits: [{ date: "2030-09-12", startTime: "19:00", endTime: "07:00" }] }, "DROP_IN_DOG_30"],
  ["duplicate visit", { kind: "TIMED_VISIT", visits: [...timedSchedule().visits, ...timedSchedule().visits] }, "DROP_IN_DOG_30"],
  ["duration mismatch", timedSchedule(1, 15), "DROP_IN_DOG_30"],
  ["schedule kind mismatch", timedSchedule()],
]) test(`rejects ${name}`, () => assert.throws(() => windows(schedule, code), { code: "INVALID_SCHEDULE" }));
for (const quantity of [0, -1, 1.5, 2_147_483_647]) test(`rejects invalid aggregate quantity ${quantity}`, () => assert.throws(() => aggregateCanonicalQuote(priced("DROP_IN_DOG_30", ["Dog"], quantity)), { code: "INVALID_QUANTITY" }));
for (const [name, change] of [
  ["negative money", (a) => { a.quote.breakdown[0].amountCents = -1; }],
  ["currency mismatch", (a) => { a.quote.currency = "EUR"; }],
  ["malformed breakdown", (a) => { a.quote.breakdown.push({ type: "EXTRA", quantity: 1, amountCents: 500 }); }],
  ["pet mismatch", (a) => { a.quote.breakdown[1].petName = "Other pet"; }],
  ["subtotal mismatch", (a) => { a.quote.serviceSubtotalCents++; }],
  ["fee mismatch", (a) => { a.quote.clientFeeCents++; }],
  ["total mismatch", (a) => { a.quote.clientTotalCents++; }],
  ["double aggregation", (a) => { a.quote.quantity = 2; }],
]) test(`money safety: ${name}`, () => {
  const a = priced("DROP_IN_DOG_30", ["Dog", "Dog"]); change(a); assert.throws(() => aggregateCanonicalQuote(a));
});
test("aggregate overflow fails before PostgreSQL", () => {
  const a = priced("DROP_IN_DOG_30", ["Dog"], 3);
  a.careOption.clientRate.baseRateCents = 1_000_000_000;
  a.quote = calculateCanonicalClientQuote({ careOption: a.careOption, pets: a.quote.pets });
  assert.throws(() => aggregateCanonicalQuote(a), { code: "INVALID_MONEY" });
});
test("fee rounds half up once on aggregate subtotal", () => {
  const a = priced("DROP_IN_DOG_30", ["Dog"], 3); a.careOption.clientRate.baseRateCents = 1005;
  a.quote = calculateCanonicalClientQuote({ careOption: a.careOption, pets: a.quote.pets });
  assert.equal(a.quote.clientFeeCents, 101); assert.equal(aggregateCanonicalQuote(a).clientFeeCents, 302);
});
test("snapshot clock is database-owned and exact replay cannot rewrite economics", async () => {
  const a = priced("DROP_IN_DOG_30", ["Dog"]), data = aggregateCanonicalQuote(a);
  const booking = { ...data, canonicalCreationKey: "key", canonicalInputHash: "hash", clientTotalCents: null, platformFeeCents: null, sitterPayoutCents: null, bookingPets: [{ position: 0, nameSnapshot: "Pet 1", speciesSnapshot: "Dog" }] };
  const instant = new Date("2030-01-01T00:00:00Z"); let writes = 0;
  const tx = { async $queryRaw(parts) { return parts.join("").includes("clock_timestamp") ? [{ now: instant }] : [{ id: "booking" }]; }, booking: { async findUnique() { return booking; } }, bookingPricingSnapshot: { async create({ data }) { writes++; return booking.pricingSnapshot = { id: "snapshot", ...data }; } } };
  const first = await createBookingPricingSnapshotWithDb({ tx, bookingId: "booking", ...a, committedAt: new Date(0) });
  assert.equal(first.committedAt, instant); assert.equal(first.currency, "USD");
  const retry = await createBookingPricingSnapshotWithDb({ tx, bookingId: "booking", ...a });
  assert.equal(retry, first); assert.equal(writes, 1);
  booking.pricingSnapshot.baseUnitCents++;
  await assert.rejects(createBookingPricingSnapshotWithDb({ tx, bookingId: "booking", ...a }), { code: "PRICING_SNAPSHOT_CONFLICT" });
});
test("migration has no backfill and only approved nullability relaxation", () => {
  const sql = readFileSync(new URL("../../../../prisma/migrations/20260912000000_add_canonical_booking_contract/migration.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
  assert(!/\b(UPDATE|DELETE|INSERT|TRUNCATE)\b/.test(sql)); assert.equal((sql.match(/DROP NOT NULL/g) || []).length, 3);
});

test("existing petDetails snapshot choices are normalized and hashed", () => {
  const input = bookingInput({ petDetails: { dogSize: ["SMALL", "SMALL"], weightClass: "SMALL_10_25" } });
  assert.deepEqual(normalized(input).intent.petDetails, { dogSize: ["SMALL"], weightClass: "SMALL_10_25" });
  assert.notEqual(normalized(input).inputHash, normalized(bookingInput()).inputHash);
});
test("malformed quote thresholds and hidden money components are rejected", () => {
  const a = priced("DROP_IN_DOG_30", ["Dog", "Dog"]);
  a.quote.breakdown[1].thresholdIncludedCount = 99;
  assert.throws(() => aggregateCanonicalQuote(a), { code: "INVALID_QUOTE" });
});
test("snapshot cannot be attached to mismatched BookingPets or quantity", async () => {
  const a = priced("DROP_IN_DOG_30", ["Dog"]), data = aggregateCanonicalQuote(a);
  const booking = { ...data, canonicalCreationKey: "key", canonicalInputHash: "hash", clientTotalCents: null, platformFeeCents: null, sitterPayoutCents: null, bookingPets: [{ position: 0, nameSnapshot: "Wrong pet", speciesSnapshot: "Dog" }] };
  const tx = { async $queryRaw() { return []; }, booking: { async findUnique() { return booking; } } };
  await assert.rejects(createBookingPricingSnapshotWithDb({ tx, bookingId: "id", ...a }), { code: "INVALID_BOOKING_CONTRACT" });
  booking.quantity = 2;
  await assert.rejects(createBookingPricingSnapshotWithDb({ tx, bookingId: "id", ...a }), { code: "INVALID_BOOKING_CONTRACT" });
});


test("transaction-compatible origin writer accepts only exact transaction-bound opaque intents", async () => {
  const client = { id: "client", email: "canonical@example.invalid", phone: null, origin: null };
  const tx = {
    client: { async findMany() { return [client]; }, async findUnique() { return client; } },
    clientOrigin: { async create({ data }) { return client.origin = { id: "origin", ...data }; } },
    $transaction() { throw new Error("Nested transactions are forbidden"); },
  };
  const intent = await resolveClientOriginWriteIntent({ db: tx, email: client.email });
  await assert.rejects(createOrVerifyClientOriginInTransaction({ tx, clientId: client.id, intent: { ...intent } }), { code: "INVALID_INPUT" });
  await assert.rejects(createOrVerifyClientOriginInTransaction({ tx: { ...tx }, clientId: client.id, intent }), { code: "INVALID_INPUT" });
  const first = await createOrVerifyClientOriginInTransaction({ tx, clientId: client.id, intent });
  assert.equal(first.origin.kind, "BUSINESS");
  const retry = await createOrVerifyClientOriginInTransaction({ tx, clientId: client.id, intent });
  assert.equal(retry.idempotent, true);
});
