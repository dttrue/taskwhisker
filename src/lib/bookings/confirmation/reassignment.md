# Post-compensation reassignment policy and guardrails

Checkpoint: main at 1dec1642d96f365e28cb31579feaf0803275aaaf. The initial worktree
was clean and matched live origin/main. This phase does not activate public
canonical booking or add schema, settlement, allocation, or adjustment records.

## Audit and policy change

The operator booking-detail AssignSitterForm calls the authenticated assignSitter
action, which delegates to assignBookingSitterWithDb. There is no sitter-facing
reassignment action. The form captures a target (including Unassigned and the
existing Assign to me option), not a free-text reason. History already stores
old sitter, new sitter, actor and the existing descriptive note.

Previously the transaction locked Booking and Visits and checked target role and
availability, but did not read compensation, attribution or rewards, and did not
block started care. It could change Booking plus PENDING/CONFIRMED Visits while
leaving completed Visits with their original sitter. An existing unit test
explicitly allowed that split. Completed performer fields were never rewritten,
but the resulting whole-booking assignment could contradict frozen financial
identity. That unsafe case is now blocked for legacy and canonical bookings.
Safe legacy pre-service reassignment and its monetary interpretation are retained.
A legacy Booking with active reward entitlement requires review before a meaningful
change: it has no canonical effective-lane commitment contract, so this phase does
not reinterpret its stored money or silently invalidate the reward. CONSUMED
without compensation blocks assignment even for legacy; RELEASED is retained.

Booking states are REQUESTED, CONFIRMED, COMPLETED, CANCELED; Visit states are
PENDING, CONFIRMED, COMPLETED, CANCELED. There is no IN_PROGRESS enum. Database
wall-clock time against persisted startTime plus completed/performed evidence
establishes whether care has begun.

## Historical, effective and frozen lanes

BookingAttributionSnapshot answers how the relationship originated and the lane
initially implied. It is immutable historical attribution, not an instruction to
pay the original sitter after reassignment.

The shared resolveEffectiveBookingCompensationLane helper takes trusted persisted
attribution and current Booking/Visit assignment. It is used by reassignment,
compensation persistence, readers and cancellation. Browser lane values never
enter this API. Existing attribution normalization and the trusted origin lane
resolver are reused; no referral ownership or progression rules change.

Before commitment:

- Historical BUSINESS_ASSIGNED always has effective BUSINESS_ASSIGNED.
- Historical SITTER_ORIGINATED retains effective SITTER_ORIGINATED when original
  referring/requested/current Booking and Visit assignments agree.
- Legitimate reassignment away derives BUSINESS_ASSIGNED for the new sitter.
- An unassigned pre-service Booking cannot commit compensation until it has a
  valid sitter and consistent Visits. Unassignment invalidates originating reward
  eligibility and releases RESERVED entitlement under the same guardrails.

At commitment, the writer reloads locked authoritative state and freezes the
current effective lane in BookingSitterCompensation.compensationLane. The existing
unique-per-Booking compensation record is sufficient; no new effective-lane table
or reassignment ledger is necessary.

After commitment, the helper validates the frozen lane and sitter; it does not
calculate a replacement lane. Same-sitter active-booking replay is read-only when
frozen/current identities agree. Different-sitter assignment, including clearing
the sitter, is blocked. An arbitrary BUSINESS_ASSIGNED attribution plus
SITTER_ORIGINATED compensation remains invalid, as do mismatched current/frozen
sitters and sitter-originated compensation for a different sitter.

Example: Alice originated a Booking. Its attribution stays SITTER_ORIGINATED with
Alice as referring/requested sitter. Before care and compensation, an operator
reassigns every Visit and Booking to Bob. Alice's RESERVED reward becomes RELEASED.
The later compensation snapshot freezes sitter Bob, lane BUSINESS_ASSIGNED, Bob's
applicable business rate and ordinary fee terms, rewardApplied=false, with no
reward/grant linkage in compensation. Pricing and attribution are unchanged; the
released reservation still records Alice's earlier entitlement. Reader and
cancellation validation accept this precise historical/effective divergence.

Returning to the original sitter before commitment may restore effective
SITTER_ORIGINATED when all assignments agree, but a RELEASED reservation never
reopens or re-reserves. Historical BUSINESS_ASSIGNED does not upgrade on return.
Post-commit return/reassignment is blocked like any other different-sitter change.

## Allowed operations and stable outcomes

| Condition | Outcome |
| --- | --- |
| Active REQUESTED/CONFIRMED, no commitment, consistent future unperformed Visits, valid available target | ASSIGNED, one history event |
| Same current sitter on an active Booking | ALREADY_ASSIGNED, no writes; committed identity must still validate |
| Compensation exists and target differs, or committed/current identity conflicts | COMPENSATION_COMMITTED_REASSIGNMENT_REQUIRES_REVIEW |
| Any Visit started, completed, has completedAt or performer evidence | CARE_ALREADY_STARTED; no whole-booking reassignment |
| CANCELED/COMPLETED Booking or terminal timestamp | INVALID_BOOKING_STATUS; no resurrection, including same-target replay |
| Missing Booking / missing or non-sitter target | BOOKING_NOT_FOUND / INVALID_SITTER |
| Conflicting persisted interval or self-overlapping schedule | SITTER_UNAVAILABLE |
| Missing/contradictory Visits or pricing | NO_VISITS / VISIT_ASSIGNMENT_MISMATCH / VISIT_TIME_INVALID / INVALID_CANONICAL_CONTRACT |
| Invalid canonical attribution/effective-lane evidence | SITTER_ORIGINATED_REASSIGNMENT_REQUIRES_LANE_CHANGE |
| Consumed-without-compensation or invalid reservation/account history | REWARD_STATE_CONFLICT |

Matching no-op requests do not perform a new availability decision or rewrite
history. A consumed reservation without compensation is still an explicit
contradiction, including on same-target requests. Successful assignments retain
the existing ASSIGNED code and add effectiveCompensationLane for canonical rows.
Raw Prisma details are not returned. Exhausted serialization retries retain the
existing CONCURRENT_CONFIRMATION_CONFLICT retry response.

## Availability and operational truth

Allowed changes check the new sitter's persisted Visit conflicts using
existing.start < candidate.end AND existing.end > candidate.start. Existing
CONFIRMED Visits, and PENDING Visits on CONFIRMED Bookings, block assignment.
Canceled Bookings do not. Back-to-back intervals are allowed with zero buffer.
Cross-midnight timestamps are used directly; UI availability never authorizes the
write. All candidate Visit ownership, current assignment and lifecycle states are
validated, and self-overlap is rejected. Clearing an assignment creates no new
sitter conflict but still requires pre-service consistent Visits.

All meaningful whole-booking assignment stops once care has started or been
performed. No future-Visit-only split is introduced. Completed Visit.sitterId,
performedBySitterId and completedAt remain unchanged. Compensation replay still
preserves its existing distinction between operational performer evidence and
immutable commitment; this phase does not repair completed financial history.

## Reward integrity

Only a valid RESERVED reservation for the historical originating sitter can be
released, and only when no compensation exists, no care has started/performed,
and reassignment invalidates its effective SITTER_ORIGINATED eligibility.
Assignment, eligible Visit changes, trusted reward release and BookingHistory
commit or roll back together. Release reuses the existing reward transition,
never changes grant terms/progression or reopens exhausted grants.

RELEASED is immutable historical evidence and may coexist with later business
compensation. Its Booking, historical sitter and grant ownership are still
validated. It never applies the rewarded fee. RESERVED with effective business
assignment is a contradiction, not an entitlement for the new sitter. CONSUMED
without compensation blocks reassignment; with a snapshot, different-sitter
reassignment is already blocked. The existing transition runtime prevents
CONSUMED -> RELEASED and RELEASED -> CONSUMED. No clawback exists here.

Compensation/cancellation lock the historical reservation owner's reward account,
which can differ from the newly assigned compensation sitter after release.
They retain rather than delete that historical reservation. No compensation
snapshot or pet compensation row is updated, replaced, transferred or split.
Business formulas, frozen client baseAggregateCents and existing rate selection
remain unchanged.

## Transactions and races

Reassignment uses the existing Serializable operation boundary. It locks Booking,
then Visits in ID order, then the original reward account when present. It rereads
financial/assignment state after the account lock. Compensation uses the same
order and derives the lane after locking. Standalone reward transitions lock only
the account and never then Booking, avoiding a lock-order inversion. Their account
version write participates in Serializable conflict detection. Retries use fresh
transactions, at most three attempts.

The care clock is read after locks and checked again after writes. Crossing the
start boundary rolls back assignment, reward release and history. No external
payment, email or other irreversible action is performed inside retries.

PostgreSQL tests synchronize real backend transactions and use pg_blocking_pids
to prove an actual overlapping lock wait. The sixteen cases cover:

- Assignment vs compensation: both orderings, with and without reward (4).
- Assignment vs confirmation, Visit completion and cancellation: both orderings (6).
- Assignment vs standalone reward consume/release: both orderings (4).
- Two different targets and duplicate same-target assignment (2).

If reassignment wins, later compensation freezes the new sitter/business lane and
sees released reward history. If compensation wins, reassignment blocks while
preserving old-sitter compensation and assignment. If care completion wins,
reassignment blocks; cancellation cannot be resurrected. Two meaningful serialized
reassignments may each produce their own history; duplicate targets produce one.
A failure after release verifies rollback of the account and all related rows.

## UI, QA and activation

The operator form displays the neutral committed-compensation review message and
disables changing that assignment. Terminal Bookings are disabled too. Server-side
guards independently handle direct/stale calls and show their error inline. No
financial review workflow or sitter/client redesign is added.

The reassignment integration suite is opt-in with TASKWHISKER_REASSIGNMENT_QA_TESTS=1.
Before mutations, the existing guard authenticates DATABASE_URL and DIRECT_URL,
requires the same configured disposable TASKWHISKER_QA_BRANCH_ID and rejects the
shared branch. Fixtures use random identities and isolated future intervals.
Cleanup verifies all 38 protected model counts and original legacy money exactly
match baseline. No environment values or hardcoded QA branch identity belong in
the patch. Full existing confirmation, cancellation, compensation, reward, reader,
canonical booking, attribution/referral and performer regression suites remain
part of verification.

This resolves safe pre-commit reassignment and effective-lane compatibility.
Post-commit changes, started/split work and contradictory reward/financial state
remain blocked/manual-review. Public canonical activation stays off. Explicit
adjustment/reallocation policy, split-performer allocation, cancellation/refund
settlement policy and public-flow readiness remain separate activation work.
No schema, pricing formula, compensation mutation, reward progression, attribution
rewrite, payout settlement or public activation changes are included.
