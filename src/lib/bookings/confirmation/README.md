# Operator confirmation workflow

Current continuation: [Visit compensation and atomic canonical financial readiness](../visitCompensation/README.md) adds owner economics, positioned authorizations, allocation/review, and confirmation integration. Earlier phase records below remain historical context.

Current reader/completion integration is documented in [Canonical / legacy reader guarding](../economics/README.md). The phase-specific reader/activation audit below describes the earlier checkpoint; use that current audit for consumer status.

`confirmBooking()` retains its existing operator authorization, Booking ID / form
input variants and `{ ok, error? }` result contract. It adds a stable `code` and
delegates to `confirmBookingWithDb`. Neither entry point accepts caller availability,
Visit windows, assignment, clock or economics. The internal WithDb service also
checks the persisted actor's OPERATOR role. There are no new public entry points.

## Contract and authority

Only **REQUESTED -> CONFIRMED** is a new transition. CANCELED and COMPLETED cannot
be reopened. Booking cancellation/completion timestamps also reject confirmation.
The authoritative projection, `CONFIRMATION_SELECT`, loads:

- Booking id, status, sitterId, operatorId, confirmedAt, canceledAt, completedAt.
- Assigned User id and role.
- Every Visit id, bookingId, operatorId, sitterId, status, startTime, endTime,
  completedAt and performedBySitterId, ordered by startTime/id.

A SITTER-role Booking assignment and at least one Visit are required. All Visit
assignments must agree with the Booking sitter and operator; split assignment is
unsupported. Missing, invalid, zero-length or reversed intervals fail. CANCELED or
COMPLETED Visits and completion/performer evidence fail; they are never resurrected.
REQUESTED Bookings may contain PENDING or legacy CONFIRMED Visits. A CONFIRMED replay
requires every Visit to already be CONFIRMED. Internally overlapping Visits fail.

Actual persisted timestamps are the schedule authority. No Booking envelope, Visit
date, day label, timezone conversion or frozen schedule JSON is used to reconstruct
them. A Visit spanning midnight or a DST transition is an ordinary increasing pair
of instants. Every persisted Visit interval is checked separately.

## Availability

Operator confirmation and reassignment preserve the existing **zero-buffer,
half-open interval** rule:

`existing.startTime < candidate.endTime && existing.endTime > candidate.startTime`

Back-to-back intervals are allowed in either direction. Other sitters and the
candidate Booking itself are excluded. CONFIRMED Visits block, preserving legacy
operator behavior even if their parent is REQUESTED. PENDING Visits on CONFIRMED
Bookings also block defensively. REQUESTED/PENDING requests do not reserve capacity.
CANCELED Bookings and CANCELED/COMPLETED Visits do not block. No IN_PROGRESS status,
sitter working-hours model or blackout model exists in the current schema.

The public calendar/checkAvailability helpers independently use a 15-minute buffer
and include PENDING Visits. This phase does not change that separate policy or its
same-day/fixed-offset calendar calculations.

## Transaction and concurrency

One Prisma Serializable interactive transaction performs authorization, locks the
Booking row and then its existing Visits in id order, loads the complete projection,
validates it, reads overlap predicates and writes the guarded status transition,
PENDING Visit transitions and one BookingHistory event. No availability result is
carried across transaction boundaries. Booking/Visit lock ordering matches the
compensation and reservation pattern.

PostgreSQL Serializable predicate tracking detects conflicting confirmation writes
after concurrent transactions both read the same interval as available. The service
retries P2034, SQLSTATE 40001/40P01 and corresponding P2010 errors in up to three
fresh transactions, using the existing reward transaction classifier. A losing
retry observes the winner's committed assignment and returns SITTER_UNAVAILABLE.
Retry exhaustion returns CONCURRENT_CONFIRMATION_CONFLICT. Unknown persistence
errors are converted to BOOKING_PERSISTENCE_ERROR without leaking database details.
No schema, advisory lock, sitter counter or migration is needed.

**Reassignment continuation:** [Post-compensation guardrails](reassignment.md)
now block different-sitter changes after commitment and whole-booking changes
after care starts. Pre-commit changes derive the effective lane and atomically
release invalidated RESERVED rewards. The paragraphs below record the earlier
confirmation-phase baseline; the confirmation workflow itself remains unchanged.

The operator's existing `assignSitter()` now uses the same Serializable Booking/Visit
lock boundary and overlap helper. This narrowly closes its old check-then-write
race with confirmation. Assignment choices, self-assignment resolution, editable
Visit statuses and history wording are preserved. Completed performer records are
not reassigned. A transaction whose snapshot predates a Booking assignment update
cannot confirm that stale identity: its locking read conflicts and it retries.
Two different Bookings racing to claim one sitter through confirmation/reassignment
also participate in the Serializable overlap checks.

The guarded update additionally requires REQUESTED, the validated sitter, and null
canceledAt/completedAt. Cancellation/completion updates respect the row locks; if
they commit first, confirmation retries or observes a terminal state. An ordinary
later lifecycle mutation is a separate operation, not an idempotent confirmation.

`date_trunc('milliseconds', clock_timestamp())` supplies time after validation and
availability reads, immediately before the transition. Every Visit start must be
strictly later; equality rejects. The clock is sampled again after history creation
and before returning the transaction callback; crossing the start boundary rolls
everything back. confirmedAt records database acceptance inside the transaction,
not a measurement of PostgreSQL's later physical COMMIT instant.

## Idempotency, history and side effects

A matching CONFIRMED Booking returns ALREADY_CONFIRMED after structural,
assignment/status and availability checks. Elapsed wall time alone does not turn a
successful replay into a new transition or retroactively accept care. Contradictory
assignments, performed/canceled Visits or current overlaps fail closed without repair.
This preserves existing state and all timestamps, creates no Visits, and writes no
history. Only the successful guarded REQUESTED transition writes the meaningful
REQUESTED -> CONFIRMED event, atomically with its Visits. Concurrent same-Booking
requests produce CONFIRMED and ALREADY_CONFIRMED with exactly one durable event.

The old operator confirmation action sent no email or external notification. This
remains true. Cache revalidation occurs only after successful transaction completion.
There is no irreversible external side effect in the transaction or retry loop.
Notification delivery infrastructure has not been introduced.

## Money and activation boundaries

Confirmation selects no money, pricing, attribution or compensation data and does
not create BookingSitterCompensation. Real canonical timed and overnight requests
and legacy operational fixtures are covered in PostgreSQL. Pricing/attribution
snapshots remain unchanged and compensation remains an independent commitment
boundary with its own lifecycle and economic validation.

The known omitted-field/operator availability blocker is resolved by this service.
**This does not make all CONFIRMED rows globally authoritative or activate public
canonical booking.** Remaining activation/operational boundaries include:

- `src/app/book/actions.js` still creates legacy CONFIRMED Bookings/Visits directly
  after a pretransaction availability read. It bypasses this service and does not
  participate in the Serializable confirmation protocol. Races involving that
  writer are not covered by the concurrency guarantee here. Its public scheduling
  and notification behavior requires a separate integration decision.
- Existing reassignment permits clearing a sitter on a CONFIRMED Booking and keeps
  completed performer assignment intact. Subsequent confirmation/compensation fails
  closed for contradictory state. This phase does not introduce a new unassignment,
  split-assignment or post-compensation adjustment policy.
- Money readers, completion/cancellation economics, frozen schedule edits,
  compensation allocation after reassignment, payout and public notification/request
  lifecycle remain the activation blockers documented in the canonical and
  compensation READMEs. Their economics and integrations are unchanged.

## Verification

Run unit/contract tests with:

```sh
node --test src/lib/bookings/confirmation/confirmation.test.js
```

Run PostgreSQL tests with:

```sh
TASKWHISKER_CONFIRMATION_QA_TESTS=1 node --test --test-concurrency=1 src/lib/bookings/confirmation/confirmation.integration.test.js
```

The integration suite invokes the existing QA guard before any mutation: both
DATABASE_URL and DIRECT_URL must authenticate the same configured
TASKWHISKER_QA_BRANCH_ID, with the known shared branch rejected. No branch ID or
credential is embedded in this code. Random isolated fixture identities scope every
write/delete. Cleanup is transactional and verifies all model counts and original
legacy monetary values against baseline. Other QA suites must run sequentially to
avoid contaminating each other's global protected-count baselines.

Twenty PostgreSQL scenarios include successful legacy confirmation/history replay,
overlap, both cancellation exclusions, back-to-back, different sitters, cross-midnight,
database time, terminal states, contradictory Visit state, two forced rollback points,
and real canonical timed/overnight creation and confirmation. Five synchronized race
scenarios cover same Booking, two overlapping Bookings both reading free, both
same-Booking reassignment/confirmation orderings with stale snapshots, and confirmed
reassignment versus another Booking's confirmation. Barriers operate inside two
real PostgreSQL transactions; merely starting two JavaScript promises is not the
concurrency evidence.
