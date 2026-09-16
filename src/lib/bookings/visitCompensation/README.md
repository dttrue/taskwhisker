# Visit compensation foundation

Canonical confirmation is the financial-readiness boundary. Public canonical
creation and split handoff remain disabled. No settlement or payout transfer is
implemented.

## Design gates

All nine gates pass: independent owner/lane policies; policy-specific database
checks; transaction-compatible preparation; deterministic frozen units;
confirmation plus server-side readiness enforcement; operational completion with
financial review; common lifecycle locks for missed review; original-commitment
readers; and no participating-sitter access expansion.

## Transaction composition

`confirmBookingWithDb` validates the operator, locks Booking then Visits ordered
by ID, checks persisted assignment, SITTER role, intervals and availability, then
calls `prepareBookingSitterCompensationWithinConfirmationTx` with the SAME Prisma
transaction client. The primitive reuses those row locks, reads frozen pricing,
pets and attribution, locks any reward account, resolves validated owner identity
and ordinary economics, and samples PostgreSQL `clock_timestamp()`.

Before status transitions it inserts BookingSitterCompensation, applied booking
pet charges, revision-1 authorization for every positioned Visit, applied unit
pet charges, and consumes an applicable reservation once. It checks database time
again before returning. Confirmation then writes Booking/Visit status and one
history event and checks database time again before commit. Any failure rolls
all of those writes back. Serializable conflicts restart the entire transaction.
No nested transaction, queue, second commit or retroactive repair exists.

The standalone server wrapper still accepts only bookingId. New standalone
commitments require CONFIRMED and unstarted care. The confirmation-only primitive
requires REQUESTED for new writes and is not a server action. Existing confirmed
replays require existing valid financial readiness. Historical standalone
commitment replay remains read-only; it never constructs missing authorizations.

## Frozen economics and policies

`CompensationPerformerPolicy` (ORDINARY/OWNER_OPERATOR),
`CompensationFeePolicy` (STANDARD_10_PERCENT/REWARD_5_PERCENT/OWNER_0_PERCENT),
and the existing compensation lane remain independent.

Owner identity is resolved from the validated server configuration, not role,
name, email, lead status or caller flags. Owner commitments use the explicit
OWNER_FROZEN_CLIENT_SERVICE source. Subtotal and payout equal the frozen client
service subtotal, with zero sitter fee, no rate lookup and no reward linkage.
An existing active owner reward requires review; it is not silently consumed or
released. Client fee stays in BookingPricingSnapshot.

Ordinary original sitter service-subtotal basis and 10%/5% fees are unchanged.
Ordinary business commitments retain the existing selected sitter/default rate
and pet rules. Initial unit authorizations use those same frozen one-unit base
and applied pet-rule amounts, and independently enforce the unit client-base
90% ceiling. No division of another sitter's compensation occurs.

Client base and additional-pet aggregates are independently floor-divided, with
remainders assigned to the lowest canonical positions. Unit service subtotal is
the sum of those two components. Current version-1 canonical pricing multiplies
unit components by quantity (normally no remainder); the distribution helper also
supports integer remainders without weakening version-1 snapshot validation.
Sitter fees round half-up per unit. Consequently their sum can differ by cents
from the original booking fee rounded on the aggregate. Policy version 1 and
frozen unit amounts explain this difference without changing the commitment.

## Schema, history and compatibility

Visit gains nullable canonicalUnitPosition and uniqueness within Booking. New
canonical creation assigns 0..quantity-1. A database trigger prevents position
updates, including silently assigning historical null positions.

BookingSitterCompensation gains nullable performerPolicy and feePolicy. Existing
NULL pairs retain the old ordinary/reward interpretation. New writes explicitly
set both. New CHECK constraints retain old semantics and allow owner economics
only with owner policy/source and zero fee. No historical row is backfilled.

New models:
- VisitSitterCompensationAuthorization: immutable economics, actor, operation,
  source/version, unit position, time, revision and unique predecessor.
- VisitCompensationAuthorizationPetCharge: immutable applied unit pet provenance.
- VisitCompensationAuthorizationVoid: append-only void evidence.
- VisitSitterCompensationAllocation: one immutable earned row per Visit, exact
  authorization and actual performer.
- VisitFinancialReview: immutable observations, unique by Visit/reason/evidence.

Current authorization is the highest revision, only if not voided. Never fall
back to an earlier revision. A successor establishes supersession without
updating predecessor terms. This phase writes initial revisions only; there is
no reassignment/supersession endpoint. Future revisions must add pre-start,
performer/allocation, availability and bounded-participation checks before use.

Database checks enforce nonnegative money, component sums, fee+payout=subtotal,
half-up fee rounding, policy-specific 0/500/1000 bps, reward references, source
shape, ordinary unit base ceiling and revision/position validity. Restrictive FKs
protect financial dependencies. UPDATE triggers protect authorization, pet,
void, allocation and review rows. No application update/recalculation method is
exposed; fixture cleanup explicitly deletes only captured test rows.

Pre-migration canonical rows without positions or authorizations require manual
review. Confirmation and sitter actions do not repair them. Legacy confirmation,
completion and money meanings remain unchanged. Frozen owner policy is not
reclassified when environment configuration later changes.

## Execution, allocation and financial review

There is no invented Visit-start state. Confirmation prepares finances before
care becomes ready. Server sitter booking detail returns an unavailable-for-
service view for incomplete active canonical bookings, withholding actionable
location/access/care details. The server dashboard excludes those bookings from
route/action DTOs and shows a review notice. Terminal historical details remain
readable. Sitter completion rechecks readiness under lifecycle locks and rejects
missing/contradictory terms, persisting FINANCIAL_READINESS_MISSING review.

Completion uses actual performedBySitterId. Matching performer evidence creates
an allocation atomically with completion, copying frozen authorization terms.
No current rate or current owner configuration is consulted. Retry returns the
same allocation. Operator completion can persist operational truth with no
performer. It creates a review and no allocation. Reasons distinguish absent
performer, mismatch, missing authorization and invalid authorization. Reviews
are idempotent for identical evidence; no review-resolution API is provided.
Booking completion is not conditioned on every allocation in this phase.

Canonical pre-service cancellation voids active unperformed authorizations and
creates no earnings. Consumed rewards stay consumed. Missed-Visit review locks
Booking then Visit, re-reads status/performer/allocation evidence, checks database
time, and conditionally cancels only a still-eligible overdue Visit. It cannot
overwrite a concurrent completed Visit or its performer/completion timestamp.

## Reconciliation and activation boundary

`readVisitCompensationExposure` distinguishes original commitment, known earned
allocations, and active unearned authorization exposure. Completed allocations
are counted once. Canceled units contribute no unearned exposure. Completed but
unallocated or otherwise missing coverage returns null total exposure with a
review count, rather than a misleading zero. No cap, clawback or transfer entry
is inferred from original-versus-earned differences.

Existing booking economics readers continue to report original commitments;
canonical per-Visit UI estimates remain unavailable until allocation readers are
adopted intentionally. Booking.sitterId remains lead. Split-aware completion and
readers, selected-Visit handoff, participant care DTOs, own-earnings access and a
separately scoped messaging contract remain prerequisites to handoff activation.
No booking or conversation access is broadened.

## QA

`node scripts/visit-compensation-qa.mjs inspect|apply|verify` authenticates both
URLs to the configured disposable QA identity, validates owner configuration,
applies only the expected new migration, checks migration status and SQL
constraints, and compares protected counts and legacy money. Credentials and
configured identities are never printed.

`node scripts/run-visit-compensation-regressions.mjs` runs all nine PostgreSQL
suites sequentially. Each uses isolated fixture identities and cleanup with
protected-state equality. Race tests use actual PostgreSQL backends and
`pg_blocking_pids` to prove lock overlap. Pure tests run with
`node --test src/lib/**/*.test.js` (PostgreSQL suites opt in separately).
