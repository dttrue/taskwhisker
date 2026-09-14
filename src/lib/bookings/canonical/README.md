# Canonical Booking V1: internal contract and activation audit

Current reader/completion integration is documented in [Canonical / legacy reader guarding](../economics/README.md). The phase-specific reader/activation audit below describes the earlier checkpoint; use that current audit for consumer status.

This service is internal and unwired. No public action, route, preview submit,
email sender or production caller invokes it. QA fixtures are deleted. Legacy
creation, calculations and readers are unchanged. Do not create lasting production
canonical rows until the activation blockers below have been resolved.

## Internal API and authoritative choices

`canonicalBookingService.js:createCanonicalBooking({ operatorId, creationKey, input })`
uses the application's Prisma client. `operatorId` is trusted server ownership
context, validated as an OPERATOR; the future caller must authenticate that context.
`createCanonicalBookingWithDb` is the testable internal implementation, not a public
server action. Callers retain one random opaque key (e.g. UUID) per intent.

`input` supports:

- `client: { name, email?, phone? }`, using existing attribution identity normalization;
- `careOptionCode` and ordered `pets: [{ name, species }]`;
- `schedule: { kind: 'TIMED_VISIT', visits: [{ date, startTime, endTime }] }`, or
  `{ kind: 'OVERNIGHT_STAY', arrivalDate, departureDate, arrivalTime, departureTime }`;
- optional service `location` (addressLine1, addressLine2, city, state, postalCode,
  country, accessInstructions, locationNotes), notes and existing petDetails choices;
- optional `referralCode` and `requestReferringSitter: true` to request that verified
  code's sitter. Otherwise the existing DEFAULT_PUBLIC_BOOKING_SITTER_USER_ID
  configuration and SITTER-role check resolve assignment inside the transaction.

Money, caller quantity, versions, currency, clocks, lane, raw referring/requested
sitter IDs and other unknown properties are discarded. Referral codes are verified
by the existing opaque-intent verifier inside the transaction. There is no browser
choice that directly sets the assigned sitter ID or compensation lane.

## Persisted Booking contract

New nullable fields (legacy rows leave all null):

```prisma
canonicalCreationKey String? @unique
canonicalInputHash   String?
careOfferingId       String?
careOfferingCode     String?
careOptionId         String?
careOptionCode       String?
billingUnit          CareBillingUnit?
scheduleKind         CareScheduleKind?
durationMinutes      Int?
quantity             Int?
scheduleTimeZone     String?
canonicalSchedule    Json?
```

Canonical IDs are frozen scalar strings, not catalog foreign keys; deleting a
catalog record cannot erase the historical Booking identity. Codes, duration and
billing semantics come from the catalog loaded in the same transaction as pricing.
`canonicalSchedule` preserves normalized original schedule choices separately from
operational Visits, which existing workflows may later change. `scheduleTimeZone`
freezes the IANA identifier used to convert those choices. For timed care, duration
must equal the selected option. Overnight options can have null duration.

Existing Booking startTime/endTime enclose the generated schedule; address, notes,
petNames and optional petDetails use the existing snapshot fields. BookingPet rows
use zero-based contiguous positions with nameSnapshot/speciesSnapshot; petId stays
null, so pricing never relies on mutable Pet records. No competing pet snapshot
system is introduced. The pricing writer compares persisted ordered pets to quote
pets before accepting the snapshot.

### Truthful legacy monetary coexistence

```prisma
// Before                         // After
clientTotalCents  Int              clientTotalCents  Int?
platformFeeCents  Int              platformFeeCents  Int?
sitterPayoutCents Int              sitterPayoutCents Int?
```

Canonical rows set all three to NULL. Unknown sitter compensation is not zero.
Canonical client total and fee live only in BookingPricingSnapshot. Legacy rows
retain their exact values and the legacy writer still populates all three.

Canonical identity is the complete Booking input contract plus pricing snapshot
presence. Missing/inconsistent canonical data fails replay closed. No new mode enum.
This invariant is established by the internal service transaction, not by a database
trigger preventing all possible manual SQL mutations.

## Quantity, timezone and DST

The existing authority is BUSINESS_TIME_ZONE from `src/lib/visits/visitOperations.js`:
America/New_York. No browser, machine, Node default zone or fixed UTC−04:00 offset
sets canonical scheduling semantics.

VISIT + TIMED_VISIT: quantity is the number of validated distinct requested windows,
normalized chronologically. Daytime end must exceed start within 07:00–22:00 and
match option duration. Duplicate/overlapping windows fail. V1 accepts explicit
windows rather than inventing recurring-calendar semantics.

NIGHT + OVERNIGHT_STAY: quantity is the calendar-night count in the arrival-inclusive,
departure-exclusive range, derived before writes. Each date creates one Visit from
its local arrival time to the next calendar date's local departure time. September
12–14 at 19:00/07:00 yields two Visits, not one continuous stay. Same-day numerical
end-after-start validation does not apply to overnight care. Overlapping nightly
windows fail. There must be 1–366 units, bounding transaction work.

IANA conversion samples nearby zone offsets and round-trips candidate UTC instants
against the requested local components. Exactly one match is required: nonexistent
spring-forward times and ambiguous fall-back times are rejected with
INVALID_LOCAL_TIME. Dates use strict round-trip validation; zero/reversed stays,
invalid dates and malformed times fail. Date enumeration uses UTC calendar arithmetic,
not elapsed duration between Visit instants. DST therefore changes elapsed hours,
never billable-night quantity. Visit.date is business midnight of the arrival date.

## Exact final BookingPricingSnapshot scalar DTO

```text
id: String                         bookingId: String (unique)
createdAt: DateTime                 committedAt: DateTime
economicsVersion: Int              currency: String
careOfferingId: String?             careOfferingCode: String
careOfferingName: String            careOptionId: String?
careOptionCode: String              careOptionLabel: String
primarySpecies: String?             billingUnit: CareBillingUnit
scheduleKind: CareScheduleKind      durationMinutes: Int?
quantity: Int                      clientRateId: String?
clientRateVersion: Int              baseUnitCents: Int
baseAggregateCents: Int             additionalPetAggregateCents: Int
serviceSubtotalCents: Int           clientFeeBasisPoints: Int
clientFeeCents: Int                 clientTotalCents: Int
breakdown: Json
```

Existing relations/indexes remain: Booking CASCADE; CareOffering, CareOption and
ClientCareRate SET NULL. Thus catalog deletion may clear the snapshot's nullable FK,
but frozen Booking IDs, snapshot codes/names and monetary values remain. Booking
deletion still deletes pricing history; changing this requires separate review of
`scripts/cleanup-availability.js`, `scripts/cleanup-test-visit.js` and QA cleanup.
No snapshot update method exists. Administrative SQL is outside this service boundary.

`economicsVersion = 1` identifies this first persisted canonical aggregation contract.
It is not a fabricated catalog version. clientRateId/clientRateVersion use actual
loaded rate metadata. No redundant pricingContractVersion is added.

## Pricing and compensation consumers

The existing canonical engine prices one unit. Its complete quote and deterministic
BASE_CARE / ADDITIONAL_PET breakdown are validated using that same engine. Only the
currently supported USD contract is accepted. Prices remain integer cents bounded
by PostgreSQL Int, with negative/overflow/mismatched/malformed inputs rejected.

- baseUnitCents = canonical one-unit BASE_CARE amount.
- baseAggregateCents = baseUnitCents × quantity.
- additionalPetAggregateCents = sum of one-unit ADDITIONAL_PET amounts × quantity.
- serviceSubtotalCents = baseAggregateCents + additionalPetAggregateCents.
- clientFeeBasisPoints = existing canonical 1000 basis points.
- clientFeeCents = existing half-up fee calculation, rounded once on aggregate subtotal.
- clientTotalCents = serviceSubtotalCents + clientFeeCents.

Breakdown keeps the existing entry types, pet identity/index/threshold metadata,
with each entry quantity and amountCents scaled once. No extras or hidden service
components are accepted. Never multiply the snapshot amounts by quantity again.

BUSINESS_ASSIGNED must later use frozen **baseAggregateCents** for the ordinary
90% base ceiling. SITTER_ORIGINATED must later use frozen **serviceSubtotalCents**
as its 100% compensation basis, excluding the client fee. Neither consumer should
parse breakdown JSON or re-query mutable rates to obtain those bases.

## Transaction and attribution atomicity

One Serializable Prisma interactive transaction:

1. Validates trusted operator and looks for a prior key before catalog/origin reads.
2. Verifies optional referral, resolves trusted assignment and client identity.
3. Resolves the existing opaque client-origin intent, creates a Client if necessary,
   and creates/verifies its first origin. Existing client profiles are not overwritten.
4. Loads canonical catalog and one-unit quote; validates schedule and aggregate money.
5. Creates REQUESTED Booking and ordered BookingPets with null legacy money.
6. Creates one PENDING Visit per derived unit.
7. Writes immutable BookingAttributionSnapshot and BookingPricingSnapshot.
8. Writes REQUESTED BookingHistory and returns the persisted aggregate.

REQUESTED/PENDING records a request without pretending that a production availability
or confirmation workflow has accepted it. No booking line items are required by the
schema/lifecycle; no legacy line items are created with canonical economics. No
conversation or emails are created. Those activation integrations are separate.

Attribution extraction retains the prior wrappers, error handling, validation,
first-origin-wins and conflict behavior. `createOrVerifyClientOriginInTransaction`
requires an opaque intent minted against the exact tx object. The shared unchanged
write body checks client binding, existing origin, operator verification if required,
and referring-sitter role. `createBookingAttributionSnapshotInTransaction` reuses
existing normalization and exact-match replay rules, with no independent transaction.
Canonical attribution is computed from verified inputs and current authoritative
origin before Booking commit, never reconstructed afterward.

Any failure rolls back Client/origin, Booking, pets, Visits, both snapshots and
history. The pricing writer locks the Booking row before checking/writing its unique
snapshot. Matching direct replays return the existing snapshot; differing contracts
fail closed. committedAt is sampled from PostgreSQL millisecond clock_timestamp()
after locking, not caller time. It records acceptance inside the committing transaction,
not a claimed measurement of PostgreSQL's later physical commit instant.

## Idempotency and concurrency

canonicalCreationKey is a retained opaque 20–128-character token (UUID accepted).
It is unique globally. canonicalInputHash is SHA-256 of an explicit deterministic
normalized object containing trusted operator, normalized contact/name, careOptionCode,
ordered pets, original schedule inputs, business timezone, location, petDetails,
notes, referral-code hash and requested-referrer versus configured-default intent.
Raw referral codes are not persisted. No prices, labels from catalog, caller quantity,
server timestamps, current default sitter resolution or mutable ClientOrigin values
enter the hash. Thus changes to catalog or assignment configuration cannot reprice
an exact retry. Changing actual normalized choices under the same key fails with
IDEMPOTENCY_CONFLICT. Caller monetary noise does not change the hash.

Serializable transactions plus the unique key resolve concurrent same-key creation
into one Booking. P2002/P2034 are handled outside the failed transaction: verify the
committed winner, or retry up to three complete transactions. Exhaustion raises stable
CANONICAL_CREATION_CONFLICT rather than a raw Prisma uniqueness error. Every retry
must retain the same key; generating a new key intentionally represents a new intent.
Snapshot uniqueness alone never substitutes for Booking creation idempotency.

## Public activation blockers: exhaustive direct legacy-money consumer audit

Paths below are repository-relative. No existing readers are changed now: their
legacy behavior remains safe because public canonical creation is unwired and QA
fixtures are cleaned. They are NOT safe for persistent canonical production rows.
Classification: G = guard/explicit economics branch before activation;
C = needs future BookingSitterCompensation; R = needs canonical cancellation/refund semantics.

| File | Assumption / action required | Class |
| --- | --- | --- |
| src/app/book/actions.js | Legacy writer, submitted base, fee deduction, response money. Keep legacy route separate; future canonical submission must invoke internal service explicitly. | G |
| src/app/client/bookings/[clientLinkToken]/page.jsx | Legacy client-total summary and pricing display. | G |
| src/app/dashboard/operator/bookings/actions.js | Completion total = fee + payout; cancellation-review fee basis. | G, C, R |
| src/app/dashboard/operator/bookings/[id]/page.jsx | Legacy total, platform fee and payout displays. | G, C |
| src/app/dashboard/operator/_components/BookingsTable.jsx | Legacy totals in desktop/mobile rows. | G |
| src/app/dashboard/operator/lib/dashboardUtils.js | Revenue arithmetic and projected total DTOs coerce missing totals to zero. | G |
| src/app/dashboard/operator/lib/dashboardData.js | SQL sum/groupBy of legacy clientTotalCents and revenue defaults. | G |
| src/app/dashboard/operator/lib/getOperatorDashboardData.js | Legacy total aggregation for reports/metrics. | G |
| src/app/dashboard/operator/operations/page.jsx | Allocates legacy sitter payout across Visit count. | G, C |
| src/app/dashboard/sitter/page.jsx | Today/route/remaining payout allocations from legacy booking payout. | G, C |
| src/app/dashboard/sitter/lib/sitterDashboardUtils.js | Payout arithmetic, normalized DTOs and per-Visit allocation. | G, C |
| src/app/dashboard/sitter/bookings/[id]/page.jsx | Legacy payout and client total displays. | G, C |
| src/app/dashboard/sitter/_components/BookingTable.jsx | Legacy payout display. | G, C |
| src/app/dashboard/sitter/_components/BookingCard.jsx | Legacy payout display. | G, C |
| src/app/dashboard/sitter/_components/SitterRoutePanel.jsx | Selected Booking payout display. | G, C |
| src/app/dashboard/sitter/_components/SitterDashboardLive.jsx | Sums projected payout DTOs. | G, C |
| src/lib/bookings/cancelBookingTransaction.js | 15% cancellation helper uses legacy total; mutation accepts fee supplied by existing workflow. | R |
| src/app/dashboard/sitter/messages/[bookingId]/approveCancellationActions.js | Cancellation fee computed from legacy client total. | R |

Additional boundaries audited:

- src/lib/email/sendClientBookingConfirmationEmail.js and
  src/lib/email/sendSitterBookingNotificationEmail.js do not consume these money
  fields. Safe while unwired; future request/confirmation messaging must reflect
  REQUESTED lifecycle and canonical aggregate schedule, without sending legacy confirmation.
- Canonical preview and src/lib/pricing/* use quote DTOs, not legacy Booking columns;
  no reader migration needed for their pure arithmetic. Preview currently shows one
  unit and must re-quote the selected aggregate schedule before future submission.
- Existing BookingLineItem UI is a legacy explanation; future client/operator review
  must render the frozen canonical breakdown instead of assuming legacy line items.
- The [operator confirmation workflow](../confirmation/README.md) now enforces
  persisted Visit availability atomically, including overnight intervals. Public
  legacy creation still bypasses it; same-day scheduling and fixed-offset public
  availability conversion remain unsuitable for canonical overnight/DST submission.
  REQUESTED does not claim confirmed availability.
- Schedule-change flows must define how changes affect frozen input/price contracts;
  changing Visits cannot silently alter frozen quantity or economics.
- Blocklist checks, authenticated ownership, service-address requirements, notification
  delivery and request lifecycle need deliberate integration in the future public layer.
- Unknown canonical compensation must display as unavailable/pending, never `value ?? 0`.

## Migration and QA procedure

`20260912000000_add_canonical_booking_contract` only relaxes the three approved
NOT NULL constraints and adds canonical fields, unique key, base-money columns and
committedAt. No UPDATE, DELETE, backfill, old-migration rewrite or data reinterpretation.
The new required snapshot amount columns have no fabricated defaults: preflight
requires an empty existing pricing-snapshot table.

`scripts/canonical-booking-qa.mjs capture|apply|verify` authenticates DATABASE_URL and
DIRECT_URL independently using runtime neon.branch_id/project_id/database identity,
requires the same configured TASKWHISKER_QA_BRANCH_ID, and rejects the repository's
known shared-branch suffix. No hostname inference or full branch ID is hardcoded.
This guard inherits the repository convention that the configured matching non-shared
branch is the disposable QA branch; credentials/branch configuration must remain trusted.

Capture requires 30 completed migrations, zero snapshots, and writes all 36 model
counts plus ordered legacy Booking monetary values to a private /tmp baseline.
Apply requires that only the new migration is pending, inspects SQL, deploys it, then
verifies 31 completed migrations, nullable columns, every new historical canonical
field null, zero backfill and unchanged counts/legacy values. Tests independently
repeat both-path authentication, create isolated fixtures, and clean them atomically.
The final verify checks original monetary values as well as counts.

The canonical node:test suite covers source-of-truth inputs, quantity, all standard
examples, overflow/currency/breakdown safety, fee rounding, DST gaps/folds, opaque
transaction intent rules and writer conflicts. PostgreSQL tests cover null legacy
money, ordered pets, history, visits, both attribution lanes, retries after catalog
mutation, same-key and changed-input races, direct writer replay, legacy coexistence
and forced failures after Booking, Visits, attribution, snapshot preparation and
snapshot insertion. Every rollback checks all model counts and existing monetary values.

## Pre-final review answers

1. Frozen inputs: exact Booking fields above, ordered BookingPets, existing address,
   notes/petDetails snapshots; price identities/names and real rate metadata in pricing snapshot.
2. Quantity: Booking.quantity = BookingPricingSnapshot.quantity, positive derived units.
3. Visits: count validated explicit schedule windows before persistence.
4. Overnight: arrival-inclusive/departure-exclusive calendar nights, one cross-midnight Visit each.
5. Caller authority: allowlist normalization, catalog/quote loaded server-side, schedule-derived units.
6. Transaction: createCanonicalBookingWithDb's single Serializable callback.
7. Partial state: never from this service; all participant writes roll back together.
8. BUSINESS_ASSIGNED: frozen baseAggregateCents, then future ordinary 90% ceiling.
9. SITTER_ORIGINATED: frozen serviceSubtotalCents, excluding client fee.
10. Catalog mutation: scalar snapshots and early idempotent replay; no historical re-quote.
11. Legacy rows/path: preserved; only approved column nullability changes.
12. Public canonical submit: still disabled/unwired.
13. Future integration: authenticated canonical submit action calling canonicalBookingService,
    after reader, scheduling, availability and messaging activation work.
14. Attribution: now atomic for internal creation; public layer must still integrate verified
    referral choices and trusted ownership, never browser-supplied lane/sitter IDs.
15. Before compensation resumes: durable input/client-price/attribution dependencies are in
    place. Compensation persistence, its own atomic/retry lifecycle and activation-reader
    integration remain separate work. Reward reservation consumption and payouts are untouched.


## Completed verification (2026-09-12)

- Starting main and local origin/main: 7028c8e60a100279ddb40e7c9e2441caff32ec17;
  initial worktree clean. No fetch, commit, push, deployment or public activation.
- 366 targeted node:test tests passed, zero failures/skips: 51 new canonical unit
  tests plus 315 existing pricing, public interface, compensation, attribution,
  referral, reward and Visit performer tests.
- 64 PostgreSQL node:test tests passed, zero failures/skips: canonical 24 scenarios
  plus its parent test, existing reward progress 17 scenarios plus parent, existing
  reward reservation 20 scenarios plus parent. Suites ran sequentially against QA.
- 51 canonical unit tests also passed under TZ=Asia/Tokyo, verifying independence
  from the process timezone. Explicit UTC expectations cover both DST transitions.
- Prisma validate, client generation (5.22.0), targeted ESLint and production
  npm run build passed. The initial sandboxed build could not fetch Google Fonts;
  network-authorized retry passed without source changes to font configuration.
- Prisma migrate status: 31 migrations, database schema up to date. Only the new
  approved migration was applied. Historical monetary columns confirmed nullable.
- All 46 historical Booking monetary triples match the captured baseline exactly.
  All 36 protected model counts match. In particular: Client 11, User 4, Booking 46,
  Visit 49, BookingHistory 77, BookingLineItem 57; BookingPet, pricing/attribution
  snapshots and ClientOrigin remain zero after fixture cleanup. No catalog fixtures
  remain. Every new canonical field on historical Bookings is null.
- Legacy public writer, canonical preview/action, referral writer and reward runtime
  source files remain byte-identical to HEAD. There was no dedicated existing legacy
  createPublicBooking test file; coexistence was exercised in PostgreSQL and existing
  pricing regressions ran, without claiming new coverage of the whole legacy action.
- git diff --check passed. Complete export includes new untracked files without
  modifying the Git index. Patch verification results are reported with delivery.
