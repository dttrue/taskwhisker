# BookingSitterCompensation V1

Current continuation: [Visit compensation and atomic canonical financial readiness](../visitCompensation/README.md) adds owner economics, positioned authorizations, allocation/review, and confirmation integration. Earlier phase records below remain historical context.

Current reader/completion integration is documented in [Canonical / legacy reader guarding](../economics/README.md). The phase-specific reader/activation audit below describes the earlier checkpoint; use that current audit for consumer status.

Internal accounting persistence only. `bookingSitterCompensationService.js` exports
`commitBookingSitterCompensation({ bookingId })`; its server-bound allowlist ignores
caller sitter/lane, economics, currency, rate/reward identities and timestamps.
The WithDb variant is for trusted dependency injection and tests. No public route,
confirmation action, payout consumer or legacy reader invokes it.

## Contractual lifecycle

**CONFIRMED means lifecycle eligibility, not proof that all compensation preconditions were previously validated.**

Initial creation requires an active CONFIRMED Booking, complete canonical identity,
null legacy money, consistent frozen pricing and attribution, and a SITTER-role
current assignment. There must be exactly the frozen quantity of Visits (at least
one), all assigned to that sitter and Booking/operator. All Visits must be
CONFIRMED with valid increasing windows, no completedAt and no performedBySitterId.
PENDING on a CONFIRMED Booking is contradictory and rejected. The actual VisitStatus
enum has PENDING, CONFIRMED, COMPLETED and CANCELED, with no IN_PROGRESS state.

PostgreSQL `date_trunc('milliseconds', clock_timestamp())` is sampled after locks
and economic reads, immediately before validation and insertion. Every persisted
Visit start must be strictly greater than that time. Equality fails. Therefore
initial creation rejects REQUESTED, CANCELED, COMPLETED, started care, completed
work, absent Visits, mixed assignment and inconsistent status/timestamps.

A matching existing snapshot is returned before the initial status/time gate and
before loading sitter rates. Later completion or cancellation does not erase the
contract. Replay still validates Booking/sitter/lane/currency identity, current
Visit assignment, frozen basis and reward linkage, and never rewrites money or
committedAt. completed performer identity remains a separate fact.

The known operator `confirmBooking()` omission of sitterId and Visit times is now
resolved by the [confirmation workflow](../confirmation/README.md), which validates
persisted assignment and availability transactionally for legacy/canonical Visits.
Compensation still defends its own boundary independently. Public legacy creation
continues to bypass that confirmation service; public canonical availability,
notification and reader integrations remain activation work.

## Lane and sitter authority

Historical attribution is immutable. The shared `resolveEffectiveBookingCompensationLane`
contract derives the pre-commit effective lane from that attribution and consistent
current Booking/Visit assignment. Historical BUSINESS_ASSIGNED stays business.
Historical SITTER_ORIGINATED stays sitter-originated only while referring,
requested, Booking and Visit sitters agree; legitimate pre-commit reassignment
away derives BUSINESS_ASSIGNED for the new sitter. No attribution field changes.

The compensation snapshot freezes the effective lane and sitter. Replay validates
that frozen identity; it never derives a replacement lane or reloads rates.
Different-sitter reassignment after commitment is blocked. Released historical
reward reservations may remain attached to a reassigned business Booking, belong
to the original sitter, and never apply a reward. Active business reward
reservations remain contradictory. See [reassignment guardrails](../confirmation/reassignment.md).
Split performer allocation and final payout settlement remain unresolved.

## Frozen economics

BookingPricingSnapshot is mandatory. Its identity, supported USD currency,
quantity, base aggregation, subtotal, fee and total must be internally consistent.
There is no legacy fallback, backfill, current client-rate lookup, or breakdown
JSON parsing to obtain compensation bases. Nullable pricing catalog FKs may be
cleared by catalog deletion while Booking's frozen scalar IDs remain authoritative.

BUSINESS_ASSIGNED loads only SitterCareRate and DefaultSitterCareRate by the frozen
Booking careOptionId and current sitter. Existing selection, activity, fallback,
pet-charge thresholds, included pets, ceiling and sitter-fee algorithms are reused.
The new optional frozenClientPricing engine path compares aggregate ordinary
sitter base against floor(BookingPricingSnapshot.baseAggregateCents * 9000 / 10000).
Frozen care-option metadata defines pet interpretation. Pet compensation remains
outside that ordinary-base ceiling. The fee is standard 1000 bps, calculated once
on aggregate compensation; payout is subtotal minus fee.

SITTER_ORIGINATED uses BookingPricingSnapshot.serviceSubtotalCents exactly once,
including all frozen pets and quantity, excluding client fee. 2500 cents produces
250 cents fee and 2250 cents payout at 1000 bps. Source is always
CANONICAL_CLIENT_SERVICE_SUBTOTAL, independent of reward policy.

Both lanes use `calculateSitterEconomics`; its optional basis-points argument now
supports reward math while retaining the original default 1000 bps for all old
callers. New persistence accepts only standard 1000 and V1 reward 500. Integer
cents must be nonnegative and within PostgreSQL Int (2,147,483,647). No percentage
rounding is duplicated.

## Reward freeze and atomicity

No reservation: standard 10%. RELEASED: standard 10%, with no resurrection or
consumption. A released reservation's unused fee cannot affect the calculation.
RESERVED: validate Booking/sitter/grant relation, supported fee and reservation
lifecycle, freeze reward IDs/level/fee, insert compensation, and atomically change
RESERVED to CONSUMED with consumedAt equal to committedAt. 2500 at 500 bps yields
125 fee and 2375 payout. consumedAt is set once using a conditional update.

EXPIRED, EXHAUSTED and REVOKED grants do not invalidate an existing reservation:
RESERVED froze entitlement earlier. This operation never checks current grant
acceptance, capacity, account pointer or expiry. Grant economic fields are already
immutable through the reward runtime; no grant economics update is introduced.

CONSUMED without compensation fails with CONSUMED_WITHOUT_COMPENSATION and cannot
recreate history. Any reservation on BUSINESS_ASSIGNED, including RELEASED, fails
with BUSINESS_REWARD_CONTRADICTION. Existing reward compensation must link the
same CONSUMED reservation/grant/sitter/fee/level and consumption instant. A reward
snapshot linked to RESERVED, or a standard snapshot linked to active reward
entitlement, is contradictory and fails closed.

The existing reservation runtime now refuses NEW reservations after compensation
exists (COMPENSATION_ALREADY_COMMITTED), under the same Booking lock. Existing
reservation replay semantics and standalone consume/release behavior are unchanged.
This closes a reserve-after-standard-commit race without adding lifecycle hooks.

## Transaction and concurrency

One Serializable Prisma interactive transaction locks Booking, existing Visits
in ID order, and (when a reservation exists) the sitter reward account. Reservation
state is re-read under the account lock used by reserve/consume/release/progress.
Reward consumption increments that account's version so stale Serializable
transactions conflict and retry. Grant capacity is unchanged by consumption.

Snapshot insertion, child pet economics, conditional reservation consumption and
account version update all commit or all roll back. Forced failures after snapshot
insertion, reservation transition and account update prove full rollback on real
PostgreSQL. Retry after rollback produces exactly one snapshot and consumption.

Unique bookingId plus Booking locking serialize same-Booking writers. P2002,
P2034 and recognized PostgreSQL serialization/deadlock errors retry in a fresh
transaction using the existing three-attempt policy. The winner is returned only
after the same authoritative replay checks. Exhaustion returns stable
COMPENSATION_TRANSACTION_CONFLICT, never a raw uniqueness error.

committedAt records the server's acceptance instant inside the transaction; it is
not a claim to observe the later physical PostgreSQL commit instant.

## Financial history and deletion

One immutable BookingSitterCompensation per Booking. No update method, automatic
repricing, corrections, or reversals. Future corrections must be append-only.
Database CHECK constraints enforce balance, supported fee/currency, lane/source
shape, reward linkage presence and business ceiling arithmetic. Application-level
immutability follows the existing snapshot/grant architecture; privileged manual
SQL remains outside this service boundary.

Booking, sitter, reward reservation, reward grant and applied pet-charge relations
use Restrict. Deleting a Booking with committed compensation is intentionally
blocked. The only existing Booking deletion callers are cleanup scripts and QA
fixtures, not an admin deletion action. Existing cleanup scripts may fail on new
financial history; they are not broadened to erase it. New QA deletes only its own
captured fixture children first inside an explicit cleanup transaction.

Rate IDs and applied species-rule IDs are frozen scalar identities, deliberately
not mutable catalog FKs. Deleting rates cannot null historical identity or break
replay. rateSource distinguishes DEFAULT_RATE and SITTER_OVERRIDE; rateVersion
is the real selected record version (never fabricated). Base unit/aggregate,
included count, default additional rate, pet aggregate and each applied pet rule's
ID, threshold and integer amounts explain the committed economics. Rules use the
selected parent rate's version; pet-rule models have no independent version.

## Exact schema and relations

```prisma
enum BookingSitterRateSource {
  SITTER_OVERRIDE
  DEFAULT_RATE
  CANONICAL_CLIENT_SERVICE_SUBTOTAL
}

model BookingSitterCompensation {
  id        String @id @default(cuid())
  bookingId String @unique
  sitterId  String
  compensationLane BookingCompensationLane
  currency String
  quantity Int

  clientBaseAggregateCents   Int?
  clientServiceSubtotalCents Int?
  sitterCompensationSubtotalCents Int
  sitterFeeBasisPoints Int
  sitterFeeCents Int
  sitterPayoutCents Int
  rateSource BookingSitterRateSource

  // Frozen scalar identities survive catalog deletion; versions are real rate versions.
  sourceRateId String?
  rateVersion Int?
  baseUnitCompensationCents Int?
  baseAggregateCompensationCents Int?
  additionalPetCompensationCents Int?
  includedPetCount Int?
  defaultAdditionalCents Int?

  rewardApplied Boolean @default(false)
  rewardReservationId String? @unique
  rewardGrantId String?
  rewardLevel Int?
  // Required, with no caller/default clock. Writer samples PostgreSQL clock_timestamp().
  committedAt DateTime
  createdAt DateTime @default(now())

  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  sitter User @relation(fields: [sitterId], references: [id], onDelete: Restrict)
  rewardReservation SitterRewardReservation? @relation(fields: [rewardReservationId], references: [id], onDelete: Restrict)
  rewardGrant SitterRewardGrant? @relation(fields: [rewardGrantId], references: [id], onDelete: Restrict)
  petCharges BookingSitterCompensationPetCharge[]

  @@index([sitterId, committedAt])
  @@index([rewardGrantId])
}

model BookingSitterCompensationPetCharge {
  id String @id @default(cuid())
  compensationId String
  petPosition Int
  species String
  sourcePetChargeId String?
  thresholdIncludedCount Int?
  unitAmountCents Int
  aggregateAmountCents Int
  compensation BookingSitterCompensation @relation(fields: [compensationId], references: [id], onDelete: Restrict)

  @@unique([compensationId, petPosition])
}

```

Inverse relations: Booking.sitterCompensation; User.bookingSitterCompensations;
SitterRewardReservation.compensation; SitterRewardGrant.compensations.

## QA and regression procedure

`scripts/booking-sitter-compensation-qa.mjs capture|apply|verify` authenticates both
DATABASE_URL and DIRECT_URL using server-reported Neon branch/project/database,
requires equality with TASKWHISKER_QA_BRANCH_ID, and rejects the known shared
branch suffix via the existing canonical QA guard. It relies on the existing
configuration convention that this verified non-shared branch is disposable QA.
Secrets and full branch identity are never printed or hardcoded.

Capture requires exactly 31 completed migrations and records all 36 preexisting
model counts plus original legacy Booking monetary values. Apply permits only
20260913000000_add_booking_sitter_compensation, inspects all 17 additive statements,
then verifies 32 completed migrations, four CHECK constraints, both new tables
empty, no backfill and unchanged protected state. Verify repeats authentication,
protected state, empty-table and migrate-status checks after fixture cleanup.

Unit tests run with node:test. PostgreSQL suites are opt-in and must run serially
because each checks a global protected baseline:

```sh
TASKWHISKER_COMPENSATION_QA_TESTS=1 TASKWHISKER_CANONICAL_QA_TESTS=1 TASKWHISKER_REWARD_QA_TESTS=1 \
node --test --test-concurrency=1 \
  src/lib/bookings/compensation/bookingSitterCompensation.integration.test.js \
  src/lib/bookings/canonical/canonicalBooking.integration.test.js \
  src/lib/rewards/rewardReservation.integration.test.js \
  src/lib/rewards/rewardProgressGrant.integration.test.js
```

The new PostgreSQL suite covers both lanes/rates, standard and reward races with
explicit lock barriers, reserved grant freeze, released fallback, consumed-history
invariants, three failure-injection boundaries, postcommit catalog/rate mutation,
precommit current-client-rate mutation, lifecycle/time/assignment failures,
completed replay, restrictive FKs and compensation versus reward release.
All fixtures are canonical Bookings from the existing internal writer; their
CONFIRMED transition is isolated QA setup, not production activation.

## Legacy coexistence and scope

Legacy Booking clientTotalCents/platformFeeCents/sitterPayoutCents and all existing
money readers remain unchanged: public booking writer, client detail, operator
booking actions/detail/table/dashboard reports/operations, sitter dashboards,
booking cards/tables/detail/route panels, cancellation helpers and approval flows.
The exhaustive paths remain in ../canonical/README.md's legacy-reader audit.

No Stripe transfers, disbursement, payout queue, tax, refunds, chargebacks,
cancellation compensation, corrections/reversals, public activation, legacy
backfill, dashboard integration, or per-Visit payout allocation is implemented.
