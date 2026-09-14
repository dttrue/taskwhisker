# Canonical / legacy reader guarding

Checkpoint: `main`, `e0a64a0e0638b5b4c152990cc892b6b69cc620f8` (Harden booking confirmation workflow). Initial worktree was clean; cached origin/main and the live remote main matched. No migration is required. Public canonical booking remains inactive.

## Authoritative read contract

`bookingEconomics.js` contains only frozen reads, validation, formatting and aggregation. It imports no pricing, compensation, reward or database engine and never writes. `readBookingEconomics(booking)` returns:

```js
{
  economicsKind: "LEGACY" | "CANONICAL",
  client: { status, totalCents, subtotalCents, feeCents, currency },
  sitter: { status, payoutCents, subtotalCents, feeCents, currency,
    compensationLane, rewardApplied },
  legacyPlatformFeeCents,
}
```

Canonical identity uses existing frozen Booking markers (creation key, input hash, care identity, quantity/billing/schedule metadata), pricing snapshot presence or compensation presence. Missing pricing cannot turn a marked canonical Booking into legacy. Contradictory identity, unsupported currency, malformed amounts or inconsistent frozen balances return UNAVAILABLE with an explicit reason. Canonical legacy columns must remain null. A legacy row with incomplete money also fails closed.

Canonical client total/subtotal/client fee/currency come exclusively from BookingPricingSnapshot. Canonical sitter subtotal/fee/payout/currency/lane/reward flag come exclusively from BookingSitterCompensation. Validation compares frozen identities, sum balances, assignment, quantity, rate provenance and consumed reward linkage. It never re-quotes or recalculates historical fees from current policy/rates. Catalog foreign keys may be null after catalog deletion; Booking's frozen identities remain authoritative.

Legacy total, payout and historical platform fee retain their stored meanings. Canonical client fee is never substituted for legacy platform fee. Legacy subtotal and separate sitter/client fees remain null because no equivalent historical decomposition is inferred.

Missing compensation is PENDING with null payout. An omitted relation is UNAVAILABLE, distinct from a loaded null relation. Committed compensation with contradictory sitter/lane/quantity/currency/reward identity is UNAVAILABLE while valid client pricing remains available. UI shows Pending or Unavailable, never a fabricated zero. Actual stored zero remains a valid money amount.

Projected map DTOs carry `economics`; Booking money columns are not repurposed. Shared economicsInclude/economicsSelect load snapshots, attribution and the small reward linkage needed for validation in the financial Booking query. PostgreSQL tests verify relation query count is constant for one versus five Bookings. There is no query per rendered row.

## Completion V1 decision

Completed Visits record operational truth. Canonical Booking COMPLETED additionally requires valid frozen pricing and valid committed compensation. All retained actions delegate to completionService.js:

- Operator whole-booking completion: existing CONFIRMED/all-Visits-COMPLETED requirements; legacy fee + payout = client total equation retained. Canonical uses independent snapshots and never the legacy equation.
- Operator Visit completion: persist Visit, then check canonical financial commitment before automatic Booking completion.
- Sitter Visit completion: preserve assignment, timing, late-reason and performer checks; persist Visit and its history before considering Booking completion.
- `src/app/actions/completeBooking.js`: no callers found. Retained as a delegate to the same authenticated operator action, so it cannot become a bypass.

Missing or contradictory compensation returns `COMPENSATION_REQUIRED_FOR_COMPLETION`. Missing/invalid canonical pricing returns its explicit pricing reason. For operational Visit success, `ok: true` is accompanied by `completionBlocked: true`, `code`, and a failed `bookingCompletion` result. The Booking remains in its existing nonterminal state. Nothing creates compensation or writes legacy money. The condition is derived again by readers and retries; it does not require schema or new accounting history.

Serializable transactions lock Booking then its Visits in stable order, matching the existing lifecycle lock order. Prisma P2034 and PostgreSQL 40001/40P01 (including wrapped P2010) retry in a new transaction, up to three attempts. Already-completed Visit retries do not rewrite Visits, timestamps or history, and continue reporting a financial block. The existing whole-booking action can complete an operationally finished Booking if approved valid compensation is already present. No new exception or reconciliation workflow is implemented.

Legacy automatic Visit completion keeps its historical operational criterion (no remaining active Visits); the legacy fee equation continues to apply to the existing whole-booking path. Invalid missing legacy money cannot pass the new read boundary. Terminal canceled Bookings are not resurrected. The retained unused alternate action now uses the same whole-booking requirements.

## Cancellation boundary

`cancellationGuard` refuses canonical cancellation with `CANONICAL_CANCELLATION_REQUIRES_REVIEW`, including waived-fee requests. Operator and sitter approval guard before legacy calculation; the shared cancellation transaction guards again before any writes. The valid legacy fee calculation remains Math.round(clientTotalCents * 1500 / 10000), or the explicitly supplied rate. Null is rejected, not zeroed. Legacy transaction writes and system messages are preserved.

Canonical cancellation/refunds, client fee refundability, sitter cancellation compensation and reward release policy remain undefined. Existing canceled canonical rows cannot present legacy cancellation defaults as an approved fee decision. Public cancellation requests may still request human review; approval cannot enter legacy economics.

## Metrics and allocation meanings

| Metric | Meaning / treatment |
| --- | --- |
| Operator confirmed revenue and status revenueCents | Historical names for gross client booking charges, not TaskWhisker revenue or cash collected. Sum legacy client totals plus canonical snapshot totals, retaining existing status/date filters and dashboard pagination behavior. |
| Booking payout aggregate | Sum legacy stored payouts and canonical committed payouts. Return knownTotalCents plus pendingCount/unavailableCount. totalCents is null if incomplete. Never imply pending amounts are zero. |
| Legacy platform fee | Separate stored historical field; retain existing detail display. |
| Canonical client fee / sitter fee | Separately labeled frozen amounts in operator detail. |
| Platform revenue | Existing pure pricing helper defines client fee + sitter fee; no application report currently consumes that definition. No new metric or substitution into gross-client-charge reports is introduced. |
| Per-Visit earnings, remaining payout, route/operations estimates | Legacy count division and rounding preserved. Canonical allocation is undefined: null amount and PENDING (missing compensation) or UNAVAILABLE (allocation unresolved). Mixed totals become unavailable; no partial number masquerades as a complete metric. |
| Legacy optimistic earned metric | Existing placeholder contribution remains zero until server refresh; canonical optimistic allocation is explicitly unavailable. This phase does not change that separate legacy behavior. |

`aggregateBookingAmounts` accepts only client and sitter metrics. It cannot sum a generic fee. Empty known datasets legitimately total zero; missing economics do not.

## Consumer audit and activation classification

All paths below are repository-relative. SAFE means the money boundary is migrated; it does not mean the entire public canonical product is activated.

| Consumer | Classification / change |
| --- | --- |
| src/app/dashboard/operator/lib/dashboardData.js | SAFE: snapshots in list and metric queries; replace legacy SQL sum with normalized frozen client-charge aggregate. |
| src/app/dashboard/operator/lib/getOperatorDashboardData.js | SAFE: retained alternate data helper, same client-total boundary. |
| src/app/dashboard/operator/lib/dashboardUtils.js | SAFE: confirmed charges and projected client totals; unavailable remains null. |
| src/app/dashboard/operator/lib/format.js | SAFE: null cannot render zero. Valid legacy Intl formatting preserved. |
| src/app/dashboard/operator/_components/BookingsTable.jsx | SAFE: desktop/mobile client totals from central display helper. |
| src/app/dashboard/operator/bookings/[id]/page.jsx | SAFE: independent client total, client fee, sitter fee, payout and manual-review notice. |
| src/app/dashboard/operator/bookings/actions.js | SAFE completion gate; GUARDED canonical cancellation and waiver. |
| src/app/actions/completeBooking.js | SAFE retained alternate delegate; no callers found. |
| src/app/dashboard/operator/operations/page.jsx | GUARDED canonical per-Visit allocation; same query loads needed economics. |
| src/app/dashboard/operator/operations/_components/DailyVisitCard.jsx | SAFE Pending/Unavailable display for guarded estimates. |
| src/app/dashboard/operator/triage/page.jsx and src/lib/operations/* | SAFE with respect to money: no economic calculation/display; operational review only. |
| src/app/dashboard/sitter/page.jsx | SAFE Booking reads; GUARDED canonical earned/Visit estimates and incomplete totals. |
| src/app/dashboard/sitter/lib/sitterDashboardUtils.js | SAFE map/Visit projections and formats; GUARDED allocation. |
| src/app/dashboard/sitter/_components/BookingCard.jsx | SAFE frozen Booking payout/Pending. |
| src/app/dashboard/sitter/_components/BookingTable.jsx | SAFE frozen Booking payout/Pending. |
| src/app/dashboard/sitter/_components/SitterRoutePanel.jsx | SAFE normalized map payout; communicates blocked completion. |
| src/app/dashboard/sitter/_components/VisitCard.jsx | SAFE Pending/Unavailable estimate; communicates blocked completion. |
| src/app/dashboard/sitter/_components/SitterDashboardLive.jsx | SAFE optimistic canonical completion gate and unavailable mixed earnings. |
| src/app/dashboard/sitter/_components/CompleteVisitButton.jsx | SAFE communicates operational success with blocked Booking completion. |
| src/app/dashboard/sitter/bookings/[id]/page.jsx | SAFE frozen payout and existing client-total surface; manual review for blocked completion. |
| src/app/dashboard/sitter/actions.js | SAFE delegates all Visit completion to central transaction. |
| src/app/dashboard/sitter/messages/[bookingId]/approveCancellationActions.js | GUARDED canonical cancellation/waiver; valid legacy fee unchanged. |
| src/app/client/bookings/[clientLinkToken]/page.jsx | SAFE canonical total, service subtotal, client fee; legacy line items preserved. No sitter economics exposed to client. |
| src/lib/bookings/cancelBookingTransaction.js | GUARDED canonical writes; null fee basis rejected. |
| src/lib/messaging/createSystemMessage.js | Same behavior; relative database import permits actual transaction tests under node:test. |
| scripts/inspectBookingsState.mjs | SAFE normalized diagnostic totals and distinctly named fees. |
| src/app/book/actions.js | Legacy-only creation and response remain unchanged; canonical public submission remains BLOCKED. |
| src/lib/email/sendClientBookingConfirmationEmail.js and sendSitterBookingNotificationEmail.js | No money rendered. Canonical request/notification integration remains BLOCKED. |
| src/lib/pricing/* and canonical preview | Quote DTOs, not historical Booking readers; unchanged, never invoked by display boundary. |
| src/lib/bookings/canonical/* | Internal immutable creation/replay contract, not UI readers; unchanged. |
| src/lib/bookings/compensation/* | Internal immutable commitment/replay contract; unchanged. Never invoked by completion/readers. |
| src/lib/rewards/rewardReservationWrites.js | Compensation-presence lifecycle guard, not a payout reader; unchanged. |
| scripts/*pricing*.mjs, seed-default-sitter-compensation.mjs, canonical-booking-qa.mjs, booking-sitter-compensation-qa.mjs | Preservation/count snapshots, not business reports. Preserve original legacy-column checks; do not reinterpret them as client/platform revenue. |
| prisma/seed.js, scripts/seed-availability.js, scripts/seed-test-visit.js | Legacy fixture writers, not canonical readers; unchanged. |

Remaining activation blockers: canonical cancellation/refunds and cancellation sitter compensation; per-Visit/split-performer allocation; post-compensation reassignment and corrections; frozen schedule edits; public canonical submission/availability/request lifecycle; notification integration; payout settlement; future financial exception/reconciliation workflow. No backfill, schema, migrations, pricing/compensation/reward/attribution formula changes, public activation or settlement are introduced.

## Verification

Unit and rendered-surface tests use node:test. The JSX tests compile the actual pages/components using the installed Next SWC compiler and render with React DOM; only framework auth/database/navigation/write-action boundaries are replaced. Tests cover operator desktop/mobile table and detail, sitter table/card/detail, client detail, legacy formatting, pending, committed and reward snapshots, and real dashboard helpers. Database tests use actual Prisma selects and the actual completion/cancellation services.

Run pure/regression tests with `node --test src/lib/**/*.test.js`. The six PostgreSQL suites are opt-in and skipped by that command without QA flags. Run the reader suite with TASKWHISKER_READERS_QA_TESTS=1. It authenticates DATABASE_URL and DIRECT_URL against the configured disposable TASKWHISKER_QA_BRANCH_ID before any mutation, using the existing QA safety guard. It creates isolated randomly named users/catalog/clients/Bookings, exercises legacy, canonical pending, committed, business and reward fixtures, and deletes only captured fixtures in FK order. Every protected model count and existing legacy money value must match baseline afterward. No branch ID, credentials or environment file is copied into source.

Existing canonical, compensation, confirmation, reward progress/grant and reward reservation PostgreSQL regressions must run sequentially, so their baseline checks cannot overlap another suite's fixtures. The final handoff report records exact test counts, protected counts, lint, Prisma validate/generate/status, production build and patch checks.

## Final verification record

- New reader/completion contracts: 65 passing node:test cases.
- Real JSX/utility surfaces: 26 passing node:test cases.
- Full pure regression: 593 passed, zero failed; six opt-in PostgreSQL parent tests skipped in this invocation and all exercised separately.
- Reader PostgreSQL suite: 13 passed, zero failed/skipped (12 subtests plus parent).
- Existing canonical/compensation/confirmation/reward PostgreSQL regressions: 108 passed, zero failed/skipped, run sequentially.
- Combined executed coverage: 714 passing tests across these runs, with no remaining failed or unexecuted PostgreSQL suite.
- Targeted ESLint: zero errors; one existing SitterRoutePanel useCallback/now dependency warning remains unchanged.
- Prisma validate and Client generation: passed (Prisma 5.22.0). Migration status: 32 migrations, schema up to date. No migrations applied.
- Production `npm run build`: passed. Network access was needed for the existing Google Fonts downloads.
- `git diff --check`: passed. No commit or push.

Protected QA baseline counts below were restored exactly. Existing legacy money values also matched baseline. Counts include all 38 Prisma models; all created financial fixtures were removed. No existing real QA Booking was mutated.

| Model | Before and after |
| --- | ---: |
| Client | 11 |
| ClientOrigin | 0 |
| ClientOriginEvent | 0 |
| Booking | 46 |
| BookingAttributionSnapshot | 0 |
| Pet | 0 |
| BookingPet | 0 |
| BookingPricingSnapshot | 0 |
| BookingSitterCompensation | 0 |
| BookingSitterCompensationPetCharge | 0 |
| BookingLineItem | 57 |
| Visit | 49 |
| BookingHistory | 77 |
| BlockedClient | 2 |
| User | 4 |
| SitterReferralCode | 0 |
| SitterRewardAccount | 0 |
| SitterRewardEvent | 0 |
| SitterRewardGrant | 0 |
| SitterRewardReservation | 0 |
| Conversation | 27 |
| Message | 75 |
| ConversationParticipant | 13 |
| Account | 0 |
| Session | 0 |
| VerificationToken | 0 |
| Service | 20 |
| ServiceAddOn | 0 |
| CareOffering | 0 |
| CareOption | 0 |
| CareSpeciesPolicy | 0 |
| ClientCareRate | 0 |
| ClientCareRatePetCharge | 0 |
| DefaultSitterCareRate | 0 |
| DefaultSitterCareRatePetCharge | 0 |
| SitterCareRate | 0 |
| SitterCareRatePetCharge | 0 |
| LegacyServiceMapping | 0 |

## Exact changed files

- `scripts/inspectBookingsState.mjs`
- `src/app/actions/completeBooking.js`
- `src/app/client/bookings/[clientLinkToken]/page.jsx`
- `src/app/dashboard/operator/_components/BookingsTable.jsx`
- `src/app/dashboard/operator/bookings/[id]/page.jsx`
- `src/app/dashboard/operator/bookings/actions.js`
- `src/app/dashboard/operator/lib/dashboardData.js`
- `src/app/dashboard/operator/lib/dashboardUtils.js`
- `src/app/dashboard/operator/lib/format.js`
- `src/app/dashboard/operator/lib/getOperatorDashboardData.js`
- `src/app/dashboard/operator/operations/_components/DailyVisitCard.jsx`
- `src/app/dashboard/operator/operations/page.jsx`
- `src/app/dashboard/sitter/_components/BookingCard.jsx`
- `src/app/dashboard/sitter/_components/BookingTable.jsx`
- `src/app/dashboard/sitter/_components/CompleteVisitButton.jsx`
- `src/app/dashboard/sitter/_components/SitterDashboardLive.jsx`
- `src/app/dashboard/sitter/_components/SitterRoutePanel.jsx`
- `src/app/dashboard/sitter/_components/VisitCard.jsx`
- `src/app/dashboard/sitter/actions.js`
- `src/app/dashboard/sitter/bookings/[id]/page.jsx`
- `src/app/dashboard/sitter/lib/sitterDashboardUtils.js`
- `src/app/dashboard/sitter/messages/[bookingId]/approveCancellationActions.js`
- `src/app/dashboard/sitter/page.jsx`
- `src/lib/bookings/cancelBookingTransaction.js`
- `src/lib/bookings/canonical/README.md`
- `src/lib/bookings/compensation/README.md`
- `src/lib/bookings/confirmation/README.md`
- `src/lib/bookings/economics/README.md`
- `src/lib/bookings/economics/bookingEconomics.integration.test.js`
- `src/lib/bookings/economics/bookingEconomics.js`
- `src/lib/bookings/economics/bookingEconomics.test.js`
- `src/lib/bookings/economics/completionService.js`
- `src/lib/bookings/economics/readerSurfaces.test.js`
- `src/lib/messaging/createSystemMessage.js`
