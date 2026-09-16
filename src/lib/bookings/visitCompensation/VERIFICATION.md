# Verification record

Base: `main`, `1d96d2ac8871c76cdd2dc8a3ce388fb1c2ac255d`. Clean at start.
Local HEAD, cached origin/main and live origin/main matched; live main was
rechecked at completion. No commit, push, staging or historical backfill.

## Tests

Pure regression: **752 passed, 0 failed**, with nine PostgreSQL suite parents
skipped in that invocation and all exercised separately against disposable QA.
PostgreSQL: **208 passed, 0 failed, 0 skipped** across nine sequential suites.
Combined final runs: **960 passing tests** (node:test counts include suite parents).

| PostgreSQL suite | Passed |
| --- | ---: |
| Visit authorization/allocation/readiness | 24 |
| Compensation | 23 |
| Economics/completion readers | 13 |
| Reassignment | 37 |
| Cancellation | 26 |
| Confirmation | 21 |
| Canonical creation | 25 |
| Reward progress/grants | 18 |
| Reward reservations | 21 |

The expanded new suite proves atomic owner/ordinary/reward/business confirmation,
rollback after compensation, authorization, reservation-consumption and history
writes, standalone REQUESTED rejection, incomplete confirmed replay/action
rejection, frozen allocation after rate changes, null/mismatched performer
reviews, idempotency, immutable financial rows and positions, cancellation voids,
and exact unit component reconciliation. Existing canonical tests include timed
and cross-midnight overnight confirmation/creation.

Synchronized races use real backend lock waits verified by pg_blocking_pids:
duplicate allocation; missed cancellation versus completion in both orders for
legacy AND canonical allocated care; and a competing different performer claim.
Existing suites also cover confirmation/assignment, compensation/cancellation,
reservation capacity and reward transition races. The initial missed-race fixture
construction error was corrected; the final expanded suite passes completely.

Per-unit fee rounding is explicitly tested: four 2505-cent service units have
1004 cents of unit fees versus the historical 1002-cent aggregate fee. Both
commitment and authorization evidence remain intact and exposure is not capped.

## Static/build checks

- Targeted ESLint over all changed JavaScript/JSX/MJS files: zero errors/warnings.
- Prisma schema validation and Client generation (5.22.0): passed.
- Production npm run build: passed. The sandbox attempt could not fetch existing
  Google Fonts; the network-enabled build succeeded, including the final runtime
  readiness refinements.
- git diff --check: passed.

## QA migration and cleanup

Both DATABASE_URL and DIRECT_URL authenticated to the configured disposable QA
branch, using the existing shared-branch rejection guard. Owner configuration was
validated without printing configured identities. One new migration was applied:
`20260916000000_visit_compensation_foundation`. Migration status is up to date.
Existing migrations are untouched. DDL adds nullable columns, policy enums,
financial tables/indexes/FKs/CHECKs and immutability triggers; it replaces only the
three existing compensation CHECK definitions to support owner policy. No data
UPDATE, backfill, column/table removal or settlement operation is included.

SQL inspection confirmed the deployed authorization/allocation/review CHECKs.
All suites independently verify protected-state equality after fixture cleanup;
final verification also matches the pre-migration baseline and confirms all five
new tables empty. Existing legacy money values are unchanged.

| Existing model | Before and after |
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

The five new financial tables each contain zero rows after cleanup.

## Patch and boundaries

Export target: `/Users/danieltorres/Desktop/taskwhisker-visit-compensation-authorization-allocation.patch`.
The export workflow compares the entire tracked plus untracked diff, checks its
file manifest, reverse applicability, configured-secret/identity exclusion and
unchanged source hashes. Export does not stage, commit or push.

Split handoff/public canonical creation remain disabled; participant ACLs,
messaging expansion, settlement, refunds and clawbacks remain outside this patch.
Historical canonical rows missing positions/authorizations require manual review.
No repair or review-resolution endpoint is exposed. Booking-level payout displays
remain original commitment displays; allocation exposure has a separate reader.

## Complete changed-file manifest

- `prisma/migrations/20260916000000_visit_compensation_foundation/migration.sql`
- `prisma/schema.prisma`
- `scripts/run-visit-compensation-regressions.mjs`
- `scripts/visit-compensation-qa.mjs`
- `src/app/dashboard/operator/bookings/actions.js`
- `src/app/dashboard/sitter/bookings/[id]/page.jsx`
- `src/app/dashboard/sitter/page.jsx`
- `src/lib/bookings/businessOwnerIdentity.test.js`
- `src/lib/bookings/cancellation/cancellationActions.test.js`
- `src/lib/bookings/cancellation/canonicalCancellation.integration.test.js`
- `src/lib/bookings/cancellation/canonicalCancellation.js`
- `src/lib/bookings/cancellation/canonicalCancellation.test.js`
- `src/lib/bookings/canonical/README.md`
- `src/lib/bookings/canonical/createCanonicalBooking.js`
- `src/lib/bookings/compensation/README.md`
- `src/lib/bookings/compensation/bookingSitterCompensation.integration.test.js`
- `src/lib/bookings/compensation/bookingSitterCompensation.test.js`
- `src/lib/bookings/compensation/commitBookingSitterCompensation.js`
- `src/lib/bookings/compensation/compensationContract.js`
- `src/lib/bookings/compensation/fixtures.js`
- `src/lib/bookings/confirmation/README.md`
- `src/lib/bookings/confirmation/confirmation.integration.test.js`
- `src/lib/bookings/confirmation/confirmationContract.js`
- `src/lib/bookings/confirmation/confirmationService.js`
- `src/lib/bookings/confirmation/reassignment.integration.test.js`
- `src/lib/bookings/economics/README.md`
- `src/lib/bookings/economics/bookingEconomics.integration.test.js`
- `src/lib/bookings/economics/bookingEconomics.js`
- `src/lib/bookings/economics/bookingEconomics.test.js`
- `src/lib/bookings/economics/completionService.js`
- `src/lib/bookings/economics/readerSurfaces.test.js`
- `src/lib/bookings/ownerLeadSitterFoundation.md`
- `src/lib/bookings/visitCompensation/README.md`
- `src/lib/bookings/visitCompensation/VERIFICATION.md`
- `src/lib/bookings/visitCompensation/contract.js`
- `src/lib/bookings/visitCompensation/contract.test.js`
- `src/lib/bookings/visitCompensation/readiness.js`
- `src/lib/bookings/visitCompensation/reconciliation.js`
- `src/lib/bookings/visitCompensation/visitCompensation.integration.test.js`
- `src/lib/bookings/visitCompensation/writes.js`
- `src/lib/visits/reviewMissedVisit.js`
