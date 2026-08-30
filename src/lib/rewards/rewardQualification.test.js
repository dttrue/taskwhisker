import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRewardQualification } from "./rewardQualification.js";

const sitter = { id: "reward-test-sitter", role: "SITTER" };
function booking() {
  return {
    id: "reward-test-booking", status: "COMPLETED",
    attributionSnapshot: { clientOriginKind: "SITTER_REFERRAL", compensationLane: "SITTER_ORIGINATED", referringSitterId: sitter.id, requestedSitterId: sitter.id },
    visits: [{ id: "visit-1", status: "COMPLETED", performedBySitterId: sitter.id, completedAt: new Date("2026-08-29T10:00:00Z") }],
  };
}
test("completed snapshot and immutable performer qualify", () => {
  assert.equal(evaluateRewardQualification(booking(), sitter).qualified, true);
});
for (const [name, mutate, code] of [
  ["not completed", (b) => { b.status = "CONFIRMED"; }, "BOOKING_NOT_COMPLETED"],
  ["missing attribution", (b) => { b.attributionSnapshot = null; }, "ATTRIBUTION_SNAPSHOT_MISSING"],
  ["business assigned", (b) => { b.attributionSnapshot.compensationLane = "BUSINESS_ASSIGNED"; }, "NOT_SITTER_ORIGINATED"],
  ["business origin", (b) => { b.attributionSnapshot.clientOriginKind = "BUSINESS"; }, "NOT_SITTER_ORIGINATED"],
  ["referring/requested mismatch", (b) => { b.attributionSnapshot.requestedSitterId = "other"; }, "SITTER_MISMATCH"],
  ["missing referring sitter", (b) => { b.attributionSnapshot.referringSitterId = null; }, "SITTER_MISMATCH"],
  ["no visits", (b) => { b.visits = []; }, "NO_VISITS"],
  ["unfinished visit", (b) => { b.visits[0].status = "CONFIRMED"; }, "VISITS_NOT_COMPLETE"],
  ["canceled visit", (b) => { b.visits[0].status = "CANCELED"; }, "VISITS_NOT_COMPLETE"],
  ["operator null performer", (b) => { b.visits[0].performedBySitterId = null; }, "PERFORMER_MISSING"],
  ["performer mismatch", (b) => { b.visits[0].performedBySitterId = "other"; }, "PERFORMER_MISMATCH"],
  ["missing completion timestamp", (b) => { b.visits[0].completedAt = null; }, "COMPLETION_TIME_MISSING"],
  ["invalid completion timestamp", (b) => { b.visits[0].completedAt = new Date(NaN); }, "COMPLETION_TIME_MISSING"],
  ["already boosted", (b) => { b.rewardReservation = { status: "CONSUMED" }; }, "BOOKING_ALREADY_REWARDED"],
]) {
  test(`${name} does not qualify`, () => {
    const row = booking(); mutate(row);
    assert.deepEqual(evaluateRewardQualification(row, sitter), { qualified: false, reasonCode: code });
  });
}
test("booking not found is expected nonqualification", () => {
  assert.equal(evaluateRewardQualification(null, sitter).reasonCode, "BOOKING_NOT_FOUND");
});
test("only the exact current SITTER is valid", () => {
  for (const user of [null, { ...sitter, role: "OPERATOR" }, { id: "other", role: "SITTER" }]) {
    assert.equal(evaluateRewardQualification(booking(), user).reasonCode, "INVALID_SITTER");
  }
});
test("split performers never earn a partial credit", () => {
  const row = booking();
  row.visits.push({ ...row.visits[0], id: "visit-2", performedBySitterId: "other" });
  assert.equal(evaluateRewardQualification(row, sitter).reasonCode, "PERFORMER_MISMATCH");
});
test("full multi-visit work qualifies once at maximum Visit.completedAt", () => {
  const row = booking();
  row.completedAt = new Date("2026-09-01T00:00:00Z");
  row.visits.unshift({ ...row.visits[0], id: "visit-2", completedAt: new Date("2026-08-29T11:00:00Z") });
  const result = evaluateRewardQualification(row, sitter);
  assert.equal(result.qualified, true);
  assert.equal(result.sitterId, sitter.id);
  assert.equal(result.qualificationTime.toISOString(), "2026-08-29T11:00:00.000Z");
});
