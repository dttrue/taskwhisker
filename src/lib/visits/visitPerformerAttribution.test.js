import assert from "node:assert/strict";
import test from "node:test";

import {
  REASSIGNABLE_VISIT_STATUSES,
  SITTER_COMPLETION_OUTCOME,
  buildOperatorCompletionData,
  buildSitterCompletionData,
  isBookingReadyForAutoCompletion,
  resolveSitterCompletionOutcome,
} from "./visitPerformerAttribution.js";

const sitterId = "sitter-a";

function visit(overrides = {}) {
  return {
    status: "CONFIRMED",
    sitterId,
    performedBySitterId: null,
    ...overrides,
  };
}

test("sitter completion records the authenticated sitter", () => {
  const completedAt = new Date("2026-08-27T16:00:00.000Z");
  assert.equal(
    resolveSitterCompletionOutcome(visit(), sitterId),
    SITTER_COMPLETION_OUTCOME.COMPLETE
  );
  assert.deepEqual(buildSitterCompletionData(sitterId, completedAt), {
    status: "COMPLETED",
    completedAt,
    performedBySitterId: sitterId,
  });
});

test("late sitter completion uses the same immutable performer attribution", () => {
  const completedAt = new Date("2026-08-27T18:00:00.000Z");
  assert.equal(
    resolveSitterCompletionOutcome(visit(), sitterId),
    SITTER_COMPLETION_OUTCOME.COMPLETE
  );
  assert.equal(
    buildSitterCompletionData(sitterId, completedAt).performedBySitterId,
    sitterId
  );
});

test("retry by the same sitter does not rewrite attribution", () => {
  assert.equal(
    resolveSitterCompletionOutcome(
      visit({ status: "COMPLETED", performedBySitterId: sitterId }),
      sitterId
    ),
    SITTER_COMPLETION_OUTCOME.ALREADY_COMPLETED
  );
});

test("a different sitter cannot overwrite an existing performer", () => {
  assert.equal(
    resolveSitterCompletionOutcome(
      visit({
        status: "COMPLETED",
        sitterId: "sitter-b",
        performedBySitterId: sitterId,
      }),
      "sitter-b"
    ),
    SITTER_COMPLETION_OUTCOME.PERFORMER_CONFLICT
  );
});

test("unfinished visits remain eligible for reassignment", () => {
  assert.deepEqual(REASSIGNABLE_VISIT_STATUSES, ["PENDING", "CONFIRMED"]);
});

test("completed visits are excluded from reassignment", () => {
  assert.equal(REASSIGNABLE_VISIT_STATUSES.includes("COMPLETED"), false);
});

test("cancellation status updates do not include performer attribution", () => {
  const cancellationUpdate = { status: "CANCELED" };
  assert.equal("performedBySitterId" in cancellationUpdate, false);
});

test("operator completion remains unattributed", () => {
  const data = buildOperatorCompletionData(
    new Date("2026-08-27T16:00:00.000Z")
  );
  assert.equal("performedBySitterId" in data, false);
});

test("booking auto-completion still requires zero active visits", () => {
  assert.equal(isBookingReadyForAutoCompletion(0), true);
  assert.equal(isBookingReadyForAutoCompletion(1), false);
});
