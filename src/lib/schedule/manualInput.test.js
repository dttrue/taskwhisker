import test from "node:test";
import assert from "node:assert/strict";
import { normalizeManualInput, ManualInputError } from "./manualInput.js";
import { manualBookingFailure } from "./manualBookingErrors.js";
import { input } from "./fixtures.js";

function failure(value) {
  try { normalizeManualInput(value); assert.fail("Expected validation failure"); }
  catch (error) { assert.ok(error instanceof ManualInputError); return manualBookingFailure(error, value); }
}
test("all invalid fields coexist, use stable keys, and never echo submitted secrets", () => {
  const result = failure(input({ clientId: null, client: { name: " ", email: "invalid", phone: "p".repeat(51), addressLine1: "a".repeat(201) },
    serviceCode: "", petIds: [null], notes: "secret".repeat(200), extras: [{ code: "EXTRA", quantity: 367 }],
    fieldErrors: { injected: "submitted-secret" } }));
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["client.name", "client.email", "client.phone", "client.addressLine1", "serviceCode", "petIds", "notes", "extras.0.quantity"].sort());
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("interval errors identify the original row even when dates would sort differently", () => {
  const value = input({ schedule: { kind: "TIMED_VISIT", visits: [
    { date: "2027-01-07", startTime: "09:00", endTime: "09:30" },
    { date: "2027-01-05", startTime: "22:00", endTime: "22:30" },
  ] } });
  assert.deepEqual(Object.keys(failure(value).fieldErrors), ["visits.1.date", "visits.1.startTime", "visits.1.endTime"]);
  value.schedule.visits[1] = { date: "2027-01-05", startTime: "09:00", endTime: "09:30" };
  assert.doesNotThrow(() => normalizeManualInput(value));
});
test("date and time syntax, overnight ordering, DST gaps, and overlaps map to applicable controls", () => {
  assert.deepEqual(Object.keys(failure(input({ schedule: { kind: "TIMED_VISIT", visits: [{ date: "bad", startTime: "bad", endTime: "09:30" }] } })).fieldErrors), ["visits.0.date", "visits.0.startTime"]);
  assert.deepEqual(Object.keys(failure(input({ schedule: { kind: "OVERNIGHT_STAY", arrivalDate: "2027-01-05", departureDate: "2027-01-04", arrivalTime: "19:00", departureTime: "07:00" } })).fieldErrors), ["arrivalDate", "departureDate"]);
  assert.ok(failure(input({ schedule: { kind: "OVERNIGHT_STAY", arrivalDate: "2027-03-13", departureDate: "2027-03-15", arrivalTime: "19:00", departureTime: "02:30" } })).fieldErrors.departureTime);
  const visit = input().schedule.visits[0];
  const result = failure(input({ schedule: { kind: "TIMED_VISIT", visits: [visit, visit] } }));
  assert.equal(Object.keys(result.fieldErrors).length, 6);
});
test("database selections map to fields but conflicts, replay, and transaction failures remain general", () => {
  for (const [code, key] of [["CLIENT_UNAVAILABLE", "clientId"], ["CLIENT_EXISTS", "client.email"], ["PET_UNAVAILABLE", "petIds"], ["SERVICE_UNAVAILABLE", "serviceCode"]]) {
    assert.deepEqual(manualBookingFailure({ code, message: "Safe validation message" }, input()).fieldErrors, { [key]: "Safe validation message" });
  }
  assert.ok(manualBookingFailure({ code: "SERVICE_UNAVAILABLE", message: "A selected extra is no longer available." }, input()).fieldErrors.extras);
  for (const code of ["SCHEDULE_CONFLICT", "P2002", "P2034", "REVIEW_REQUIRED", "PRICE_CHANGED", "VISIT_ALREADY_STARTED"]) {
    const result = manualBookingFailure({ code, message: "Safe summary", fieldErrors: { "client.name": "forged" } }, input());
    assert.deepEqual(result.fieldErrors, {});
  }
  assert.ok(!JSON.stringify(manualBookingFailure({ code: "P9999", message: "database secret" }, input())).includes("secret"));
});
test("normalization preserves the existing signed-review shape and 200-character valid names", () => {
  const name = "X".repeat(200);
  const normalized = normalizeManualInput(input({ clientId: null, client: { name }, clientTotalCents: 1 }));
  assert.equal(normalized.client.name, name);
  assert.deepEqual(Object.keys(normalized), ["clientId", "client", "petIds", "serviceCode", "schedule", "notes", "extras"]);
});

test("actual server actions return structured errors from the authorized normalization path", async () => {
  const { surfaceLoader } = await import("../bookings/surfaceTestSupport.js");
  const { fixture, ownerConfiguration } = await import("./fixtures.js");
  const previous = Object.fromEntries(Object.keys(ownerConfiguration).map((key) => [key, process.env[key]]));
  Object.assign(process.env, ownerConfiguration);
  try {
    const { db, state } = fixture();
    const actions = surfaceLoader(null, "owner", { db, dependencies: {
      "@/auth": { requireAuth: async () => ({ user: { id: "owner" } }) },
      "next/cache": { revalidatePath() {} },
    } }).load("app/dashboard/schedule/actions.js");
    const bad = input({ schedule: { kind: "TIMED_VISIT", visits: [{ date: "2027-01-05", startTime: "22:00", endTime: "22:30" }] } });
    for (const result of [await actions.reviewManualBooking(bad), await actions.saveManualBooking(bad, "unused")]) {
      assert.equal(result.ok, false);
      assert.deepEqual(Object.keys(result.fieldErrors), ["visits.0.date", "visits.0.startTime", "visits.0.endTime"]);
    }
    const mixed = input({ schedule: { kind: "TIMED_VISIT", visits: [
      { date: "2027-01-07", startTime: "09:00", endTime: "09:30" },
      { date: "2027-01-05", startTime: "09:00", endTime: "10:00" },
    ] } });
    const durationFailure = await actions.reviewManualBooking(mixed);
    assert.deepEqual(Object.keys(durationFailure.fieldErrors), ["visits.1.startTime", "visits.1.endTime"]);
    assert.equal(state.bookings.length, 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("catalog duration errors retain every failing submitted position after canonical sorting", async () => {
  const { deriveManualSchedule } = await import("./manualInput.js");
  const option = { durationMinutes: 30, offering: { billingUnit: "VISIT", scheduleKind: "TIMED_VISIT" } };
  const rows = [
    { date: "2027-01-07", startTime: "09:00", endTime: "09:30" },
    { date: "2027-01-05", startTime: "09:00", endTime: "10:00", index: 0, fieldErrors: { "visits.0.date": "forged" } },
    { date: "2027-01-06", startTime: "09:00", endTime: "10:00" },
  ];
  for (const count of [2, 3]) {
    const raw = input({ schedule: { kind: "TIMED_VISIT", visits: rows.slice(0, count) } });
    const normalized = normalizeManualInput(raw);
    assert.equal(normalized.schedule.visits[0].date, "2027-01-05");
    // The server association is absent from the signed JSON shape.
    const before = JSON.stringify(normalized);
    assert.throws(() => deriveManualSchedule(normalized.schedule, option), (error) => {
      const result = manualBookingFailure(error, raw);
      assert.deepEqual(Object.keys(result.fieldErrors), count === 2 ? ["visits.1.startTime", "visits.1.endTime"] : ["visits.1.startTime", "visits.1.endTime", "visits.2.startTime", "visits.2.endTime"]);
      return true;
    });
    assert.equal(JSON.stringify(normalized), before);
  }
});
test("unstructured authoritative schedule errors stay general even with forged row metadata", () => {
  for (const code of ["INVALID_SCHEDULE", "INVALID_LOCAL_TIME"]) {
    assert.deepEqual(manualBookingFailure({ code, message: "Schedule could not be validated.", fieldErrors: { "visits.0.date": "forged" }, visitIndex: 0 }, input()).fieldErrors, {});
  }
});


test("only server-created relationship failures carry dependencies; DST and forged metadata do not", () => {
  const stay = { kind: "OVERNIGHT_STAY", arrivalDate: "2027-03-13", departureDate: "2027-03-15", arrivalTime: "02:30", departureTime: "02:30" };
  const forged = { arrivalTime: ["departureTime"], departureTime: ["arrivalTime"] };
  const dst = failure(input({ schedule: stay, fieldDependencies: forged }));
  assert.deepEqual(dst.fieldDependencies, {});
  const range = failure(input({ schedule: { ...stay, departureDate: "2027-03-12" }, fieldDependencies: forged }));
  assert.deepEqual(range.fieldDependencies, { arrivalDate: ["arrivalDate", "departureDate"], departureDate: ["arrivalDate", "departureDate"] });
  const overlap = failure(input({ schedule: { ...stay, arrivalTime: "07:00", departureTime: "19:00" } }));
  assert.deepEqual(overlap.fieldDependencies, { arrivalTime: ["arrivalTime", "departureTime"], departureTime: ["arrivalTime", "departureTime"] });
  const general = manualBookingFailure({ code: "INVALID_SCHEDULE", message: "General", fieldDependencies: forged }, input());
  assert.deepEqual(general.fieldDependencies, {});
});
