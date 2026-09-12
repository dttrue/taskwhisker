# Reward Reservation Runtime — Phase 1

Internal entry points live in `rewardReservationService.js`. They are protected
by `server-only`, are not server actions, and accept only `bookingId` (reserve and
consume) or `bookingId` and `reason` (release). The `WithDb` functions support
internal composition and tests. Neither boundary accepts a caller clock or
caller economic terms.

## Authority and eligibility

New reservations read the Booking, attribution snapshot, referring User, reward
account, current grant and trigger event from the transaction database. The
Booking row is locked against concurrent assignment/lifecycle writes. Only
`REQUESTED` and `CONFIRMED` are eligible: these are the nonterminal states in
`BookingStatus`; existing completion/cancellation actions use `COMPLETED` and
`CANCELED`. A non-null `completedAt` or `canceledAt` also refuses a new reservation.

The snapshot must record `SITTER_REFERRAL` / `SITTER_ORIGINATED`, with matching,
non-empty referring and requested sitter IDs. That User must still be a SITTER
and match `Booking.sitterId`. No account is created by this runtime. The account's
`currentGrantId` is the sole accepting-grant pointer.

The trigger event's booking, qualification-booking and progress-booking links
are checked explicitly. Even if the triggering Booking is reopened and otherwise
eligible, it receives `TRIGGER_BOOKING_NOT_ELIGIBLE` for its own current grant.
Ordinary completed trigger bookings are already refused by lifecycle validation.

Existing reservations replay before new-reservation eligibility checks. Later
reassignment, terminal Booking state, removed attribution, expired/revoked grants
or a different current grant do not create a second lifecycle or change identity.

## Time, capacity and serialization

The acceptance instant is PostgreSQL `clock_timestamp()`, truncated to the
schema's millisecond precision, sampled **after** the Booking/account locks and
authoritative reads/count, immediately before the acceptance decision. The same
instant is written to `reservedAt`. It is not transaction-start time, request
time, caller time, Booking completion time, or commit time. A transaction that
retries samples fresh database time. Transaction-start `CURRENT_TIMESTAMP` would
incorrectly include time spent waiting for an account lock.

The grant must be current, ACTIVE, started, and unexpired at that instant. At or
after `expiresAt`, an ACTIVE grant becomes EXPIRED and its account pointer is
cleared. Stale EXPIRED, REVOKED and EXHAUSTED pointers also clear. An already-full
ACTIVE grant becomes EXHAUSTED and clears its pointer.

Capacity is `RESERVED + CONSUMED`; RELEASED does not count. All new reservations
and lifecycle mutations lock the same sitter reward account with `FOR UPDATE`
and increment its version in a Serializable transaction. This is the same
account lock used by reward progress/grant creation. A stale waiting snapshot
conflicts with the account write and restarts; recognized serialization/deadlock
failures have the existing bounded three-attempt retry policy. Count and insert
are never performed outside this serialization boundary.

At 9/10, the winning reservation inserts the tenth row, changes the grant to
EXHAUSTED, and clears `currentGrantId` in the same transaction. A competing call
retries against the closed grant. No successful serialized transaction can
insert when used capacity is already 10, so this runtime cannot reach 11.

V1 exhaustion is permanent. Releasing the tenth reservation **cannot reopen**
the grant, make it ACTIVE, or restore its pointer. Release before exhaustion
can free capacity while the grant remains ACTIVE and unexpired.

## Durable lifecycle and frozen economics

| Operation | RESERVED | CONSUMED | RELEASED |
| --- | --- | --- | --- |
| Reserve again | ALREADY_RESERVED | ALREADY_CONSUMED | RESERVATION_RELEASED |
| Consume | CONSUMED | ALREADY_CONSUMED | INVALID_RESERVATION_TRANSITION |
| Release | RELEASED | INVALID_RESERVATION_TRANSITION | ALREADY_RELEASED |

The unique `bookingId` enforces at most one reservation row for the Booking.
Same-Booking races replay that durable row after serialization. A Prisma unique
conflict can produce a replay only if a reservation for that exact Booking exists;
unrelated database failures are sanitized into `RewardReservationError` codes.

Consume and release lock the account and re-read the reservation before deciding
the transition. Consume writes `consumedAt` exactly once. Release writes
`releasedAt` and the trimmed, whitespace-normalized non-empty `releaseReason`
exactly once. Both preserve the reservation ID, sitter, grant and `reservedAt`.
Retries preserve the original terminal timestamp and release reason. CONSUMED
cannot release; RELEASED cannot consume or reserve again. A consume/release race
has one terminal winner and one invalid-transition result.

Reservation is the eligibility freeze point. Consumption does not recheck grant
acceptance, expiry, status, capacity, current pointer, or new-booking eligibility.
It therefore succeeds after EXPIRED, EXHAUSTED or REVOKED. Results expose the
referenced grant's frozen fee (currently 500 bps), maximum uses and reward level.
RELEASED results remain unavailable even though they expose the original terms.

The runtime audit found only grant creation and status updates. No application
writer changes `feeBasisPoints` or `maximumUses` after creation, and this phase
adds none. This is application-level immutability, not a new database constraint:
direct privileged database editing remains outside the runtime contract. Future
grant administration must preserve these terms, and future compensation records
will copy them into an immutable compensation snapshot.

## Result contract

Every normal result has `{ status, bookingId, reasonCode, reservation }`.
`reservation` is null for a new refusal or missing reservation; otherwise it
contains `id`, `bookingId`, `sitterId`, `grantId`, `status`, `reservedAt`,
`consumedAt`, `releasedAt`, `releaseReason`, `feeBasisPoints`, `maximumUses` and
`rewardLevel` from trusted state. Examples (IDs abbreviated):

```js
{ status: "RESERVED", bookingId: "b", reasonCode: null,
  reservation: { id: "r", bookingId: "b", sitterId: "s", grantId: "g",
    status: "RESERVED", reservedAt: new Date("2026-09-12T12:00:00.000Z"), consumedAt: null,
    releasedAt: null, releaseReason: null,
    feeBasisPoints: 500, maximumUses: 10, rewardLevel: 1 } }
{ status: "NO_REWARD_AVAILABLE", bookingId: "b",
  reasonCode: "GRANT_EXPIRED", reservation: null }
{ status: "NOT_ELIGIBLE", bookingId: "b",
  reasonCode: "TRIGGER_BOOKING_NOT_ELIGIBLE", reservation: null }
```

Other stable reasons include `NO_REWARD_ACCOUNT`, `NO_CURRENT_GRANT`,
`GRANT_EXHAUSTED`, `GRANT_REVOKED`, `CONSUMED_CANNOT_RELEASE`, and
`RELEASED_CANNOT_CONSUME`. Validation/persistence exceptions use `INVALID_INPUT`,
`INVALID_RELEASE_REASON`, `INVALID_REWARD_STATE`, `TRANSACTION_CONFLICT`, or
`PERSISTENCE_ERROR`, without raw database details.

## Deferred compensation integration

This phase does **not** implement `BookingSitterCompensation`, apply the 5% fee to
actual compensation, persist compensation/payouts, settle payments, or change
booking creation, pricing formulas, attribution/referral contracts, progress
events, UI, cancellation/reassignment hooks, reversals or operator adjustments.

**Before future compensation integration calls release, it must authoritatively
verify that no compensation has been earned.** Phase 1 lacks the compensation
record needed to prove this. Release remains an internal server-only operation;
it does not claim to solve that precondition. Future integration must also select
the valid reservation, copy its frozen terms into `BookingSitterCompensation`,
apply those terms to the compensation calculation, and coordinate consumption
and compensation persistence transactionally.

## Validation

Unit tests use `node:test` and cover the new input boundaries, lifecycle,
eligibility, capacity, timestamp boundaries, retries and rollback behavior.

The opt-in PostgreSQL tests authenticate both `DATABASE_URL` and `DIRECT_URL`,
compare server-reported branch/project/database identities, require equality
with `TASKWHISKER_QA_BRANCH_ID`, and reject the shared branch suffix `j4y` before
any fixture mutation. No QA identity is hardcoded and no credentials are logged.
Fixtures use captured unique IDs only; existing Bookings are never mutated.

Run database suites sequentially so their global protected-count baselines do
not overlap:

```sh
TASKWHISKER_REWARD_QA_TESTS=1 node --test --test-concurrency=1 \
  src/lib/rewards/rewardReservation.integration.test.js \
  src/lib/rewards/rewardProgressGrant.integration.test.js
```

Real PostgreSQL tests synchronize competing transactions at lock boundaries,
test real wall-clock expiry and irreversible transitions, and clean all fixtures
in `finally`. Every protected and reward-table count must equal baseline after
cleanup, with explicit zero-residue assertions for temporary entities. No seed,
reset, schema migration, or pre-existing Booking mutation is involved.
