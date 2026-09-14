# Canonical cancellation guardrails (V1)

Operational cancellation and financial cancellation are separate decisions.
`CANCELED` does not mean refunded, fee waived, or sitter payable zero.
There is no approved canonical cancellation percentage, client-fee refundability,
refund contract, or cancellation sitter-pay guarantee in this repository.
No payment/refund/transfer integration is invoked by these paths.

## Selection and existing flows

The operator direct-cancel action, operator client-request approval action, and
assigned-sitter approval action use the existing `isCanonicalBooking` discriminator
and `economicsSelect`. Frozen contract markers or either financial snapshot select
the canonical service. The service reloads authoritative records under locks; it
never accepts client-provided prices, schedules, assignments, clocks, or balances.
The messaging UI also loads snapshot identities so it cannot mistake a damaged
snapshot-only canonical record for legacy.

The client request action remains a request: it records a client message and
same-status history, without canceling or calculating money. Sitter approval
requires that request and the current assigned sitter. Operator approval also
requires the request. Direct operator cancellation retains its reason/actor;
requested bookings may use the existing generic operator-cancellation reason.

Legacy still uses `cancelBookingTransaction` unchanged: approval applies rounded
`clientTotalCents * 1500 / 10000`, unless waived; direct operator cancellation
waives the fee. It writes the existing cancellation fee/review columns, updates
PENDING/CONFIRMED Visits, writes history and a system message. COMPLETED Bookings
are rejected and CANCELED replays retain their existing legacy error behavior.
The legacy money interpretation/equation is unchanged. Its low-level canonical
`cancellationGuard` remains as defense against alternate callers; it is not the
canonical operational cancellation API.

Operator request approval currently has no UI callers in the repository, but its
export is guarded. Missed-Visit review is a separate pre-existing operational
triage action, not a Booking cancellation or financial adjustment; this phase
does not redefine its behavior. No Stripe checkout, payment, refund, payout, or
transfer runtime was found in the audited cancellation paths.

## Operational decision

| Locked state | Outcome |
| --- | --- |
| REQUESTED, complete valid future PENDING Visit set, no compensation | CANCELED operationally; financial review required |
| CONFIRMED, complete valid future CONFIRMED Visit set, absent or valid committed compensation | CANCELED operationally; financial review required |
| Any started Visit, completed Visit, completedAt, or performer evidence | Review only; no Booking or Visit change |
| COMPLETED / unsupported terminal Booking | INVALID_STATUS; no change |
| CANCELED | ALREADY_CANCELED; no duplicate history/message/release |
| Missing/inconsistent frozen pricing, attribution, compensation, schedule, assignment, or reward evidence | Review only; no change |
| REQUESTED with committed compensation (commitment requires CONFIRMED) | Review only; no change |
| Explicit canonical fee waiver | Review only; no change |

Database wall-clock time is sampled after locks and again after writes. If the
transaction crosses the first care-start boundary, every write rolls back. A
scheduled Visit whose start has passed is conservatively treated as started even
without completion evidence. A completion-blocked Booking therefore retains all
completed Visit truth and its nonterminal status when cancellation is requested.
Cancellation never clears a performer or completedAt or rewrites a completed Visit.

Successful canonical cancellation updates only Booking.status/canceledAt and
eligible future unperformed Visit statuses. It does not touch even the defaulted
legacy cancellation fee/waiver/review columns. Pricing and compensation snapshots,
including pet charges, reward linkage, fee basis points and all financial amounts,
remain historical evidence. Missing compensation stays missing, never zero and
never recreated or priced at cancellation time.

Every successful operational cancellation writes one BookingHistory entry with
actor, reason, from/to status, and `CANONICAL_CANCELLATION_REQUIRES_REVIEW`, plus one
system message. This existing history is sufficient for the operational decision
and its unresolved financial disposition; it is not a settlement ledger. Review-only
attempts return the stable reason without creating duplicate financial/audit state.
The client request remains the retained request evidence. A future financial
exception workflow must explicitly record resolution; none is implemented here.

## Internal outcome

`status` distinguishes CANCELED, ALREADY_CANCELED,
CANONICAL_CANCELLATION_REQUIRES_REVIEW, INVALID_STATUS and NOT_FOUND. Classification
also supplies bookingId, economicsKind, careStarted, completedVisitCount,
compensationCommitted, rewardReservationStatus, financialReviewRequired and
reasonCode. Financially unresolved canonical results retain the stable reasonCode
`CANONICAL_CANCELLATION_REQUIRES_REVIEW`, even if operationally successful.
`reviewReason` narrows missing/contradictory/started/waiver evidence. No amount
properties are returned. Authorization/input/request errors and exhausted
transaction conflicts have separate stable status values.

UI success copy conveys financial review, not a fee/refund decision. Canonical
sitter approval hides the legacy 15% and waiver controls. Direct forged waiver
requests still fail closed. Canceled canonical client/operator/sitter detail pages
show manual review. Client pages do not expose sitter economics. Legacy copy and
waiver controls are preserved. Frozen committed compensation is not a payable
balance; cancellation does not compute an adjustment.

## Rewards and concurrency

Only RESERVED with no compensation snapshot, no started/performed care, valid
ownership/attribution and a permanently voided Booking can release. Release is
composed into the same Serializable transaction using the existing reward runtime.
It never reopens an exhausted grant or resets the account's current-grant pointer.
RELEASED remains released. CONSUMED with a valid boosted snapshot stays consumed;
CONSUMED without compensation is contradictory and review-only. The existing
transition runtime forbids CONSUMED -> RELEASED and RELEASED -> CONSUMED.
No reward clawback, grant economics, or progression rules change.

Lock order is Booking, then Visits ordered by ID, then the reservation's shared
SitterRewardAccount. Compensation/confirmation/reassignment use the same lifecycle
order. Standalone reward consume/release lock only the account and never then
lock Booking, avoiding a reverse dependency. Reward transitions write account
version so stale Serializable snapshots must restart. SQLSTATE 40001/40P01 and
Prisma P2034 conflicts retry with fresh transactions (at most three attempts).
No external actions occur inside these transactions.

If completion wins, cancellation observes completed care and leaves it intact.
If cancellation wins, completion sees CANCELED Visits/Booking and cannot resurrect
them. If compensation wins, cancellation sees its immutable commitment, including
consumption. If cancellation wins, a new compensation commitment rejects the
canceled Booking. Concurrent approvals produce one cancellation history/message.
Confirmation/reassignment cannot revive the canceled Booking. A changed assignment
must pass the frozen attribution/compensation checks before cancellation can proceed.

The PostgreSQL integration suite proves actual overlapping lock waits with
`pg_blocking_pids`, not just sequential invocation. It covers both Visit-completion
orderings, both compensation orderings with/without rewards, both standalone
consume orderings, duplicate cancellation, whole-booking completion, confirmation,
and reassignment. It verifies rollback after reward release and unchanged financial
snapshots, completed Visit data, and legacy behavior. The unit/action/render suites
cover structured outcomes, invalid evidence, waiver guarding, retry, request/actor
checks, and all three real action entry points.

## QA and remaining decisions

Run the PostgreSQL suite only with `TASKWHISKER_CANCELLATION_QA_TESTS=1` after the
existing authentication guard verifies DATABASE_URL and DIRECT_URL point to the
same configured disposable TASKWHISKER_QA_BRANCH_ID and rejects the shared branch.
It uses isolated random fixtures and verifies all 38 model counts and protected
legacy money return to baseline. No schema/migration or existing QA-record updates
are required. Do not print connection strings or embed a branch identity.

This phase makes pre-service operational cancellation safe. Public canonical
activation remains blocked: automated financial cancellation is still undefined.
Before automated refunds/settlement, approve cancellation eligibility/windows,
client cancellation fees, client-fee refundability/retention, partial-care refunds,
processor fee treatment, sitter earned/guaranteed compensation and adjustments,
consumed-reward consequences, and the durable authorized exception/settlement
contract (including idempotency and payment reconciliation). No pricing, frozen
compensation economics, reward progression, payout settlement, retroactive
compensation, post-compensation reassignment, split-performer allocation, or public
canonical activation is introduced here.
