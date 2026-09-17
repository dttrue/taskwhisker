# Care snapshot and selected-Visit UI verification

## Repository and audit

Started and rechecked on clean `main` at
`bd679e5497a618ef5445a284da5b450340d44806`, exactly matching cached and live
`origin/main`. No commit, push, production migration, application deployment,
public canonical booking activation or new messaging membership was performed.

The complete Booking.notes writer audit found client care input in the public
booking action and canonical creation writer; administrative fixture labels in
prisma/seed.js; and QA markers in reward progress/reservation integration fixtures.
No runtime operator-private, financial or incident writer was found. Seed/test
metadata is enough to disqualify generic notes as the participant care boundary.
Other similarly named Service/catalog fields are separate models. No existing
operator Booking-edit workflow captures trusted care notes.

## Schema, writers and legacy behavior

One additive migration adds nullable Booking.careInstructions (TEXT) and
Booking.careInstructionsVersion (INTEGER), with a CHECK allowing null/null or
version 1 with nullable text. There are no defaults, updates, backfill, notes copies,
ACL tables or membership tables. A later explicit schema migration can remove the
new columns/constraint; no destructive rollback was executed.

Public and canonical creation explicitly capture normalized client care input as
version 1 plus trimmed text or null. Whitespace-only input is captured-empty.
Overlong input is rejected, never silently truncated. Existing Booking.notes writes
remain for lead compatibility. Existing canonical creation-key replay returns its
original record without upgrading care provenance. Seed and reward QA marker
writers do not populate the snapshot.

Legacy null provenance is never interpreted as an empty care form. It disables the
operator picker and withholds participant care/contact/location/earnings details.
No remediation editor or bulk upgrade is included. Existing lead operational
visibility and generic notes behavior remain intact.

## Operator interaction and atomicity

Visit Coverage on Booking detail shows every visit's persisted schedule, status,
scheduled sitter, performed-by identity when present, eligibility and disabled
reason. Checkboxes select explicit IDs. The roster supplies human-readable sitter
choices. An optional server preview uses existing availability/eligibility helpers;
it is advisory and does not implement a browser availability engine.

The server action requires OPERATOR, derives actor identity from the session, and
calls an allowlisted wrapper. No money, lane, fee, reward or provenance inputs are
accepted. The wrapper always requests requireCareSnapshot. The handoff transaction
checks that guard after Booking/Visit locks and before any assignment/revision
writes. The original transactional financial and availability checks still apply.
Existing internal historical callers can omit the guard; the participant DTO still
denies unverified care. Operation replay is a read-only immutable receipt.

A pending guard prevents double clicks. An operation UUID survives transport errors
and same-selection retries. Changing the selection/sitter starts a new intent.
Success clears selection and refreshes server rows; replay says it was already
saved and explains that refreshed rows show current assignments. Errors are mapped
to safe actionable copy; raw persistence errors are not returned.

## Participant, lead, routes and earnings

Participant discovery starts from Visit.sitterId and excludes lead-owned bookings.
A server resolver rechecks current assignment and SITTER role, applies care and
financial readiness, then returns the existing allowlist DTO. Dashboard entries
contain only own Visit/service/pets/client name/location and own expected/earned pay.
Coverage lists have Today, Upcoming, Missed and Completed views with ten-card pages.
Today coverage visits join the existing map and route as one-Visit stops. There is
no whole-booking query expansion for participant client payloads.

The dedicated `/dashboard/sitter/visits/[visitId]` loader returns exactly that
assigned Visit, denies unrelated/nonparticipant requests, and redirects leads to
their existing approved Booking page. It renders full trusted care text, or the
neutral captured-empty message, plus approved access instructions and client phone.
It never falls back to Booking.notes or renders raw pet JSON. Dashboard cards link
to this bounded page, not the full Booking or conversation.

Participant compensation comes only from own frozen authorization/allocation.
Owner replacement full payout and ordinary replacement business-assigned terms are
preserved by the existing reader. Lead schedule still includes every Visit and its
scheduled sitter, while lead route/actions/earnings exclude replacement work. Lead
completed-earnings queries now load the readiness fields needed to read own earned
allocations instead of using the canonical-unavailable legacy estimate.

Completion uses the existing authenticated server action and locked service.
Assignment/current authorization are rechecked, performer is frozen from the
session identity, and allocation copies authorized terms. Late completion requires
a reason. Participant detail refreshes after completion. The action response now
strips raw allocation/reward/review objects for every sitter caller.

Historical message reads/sends/polling/unread permissions and whole-booking
cancellation remain lead-only. Participant cards/details provide no messaging,
cancellation, reassignment, reward history or operator controls.

## Validation

Final unit/render/action suite: **795 passed, 0 failed, 0 skipped**.
Final targeted ESLint: **0 errors, 0 warnings**. Prisma validate and generate passed.
`npm run build` passed, including the new participant route. The first sandboxed
build could not fetch configured Google Fonts; the network-enabled build passed.
`git diff --check` passed.
Browser QA used synthetic fixtures rendered from the real JSX with compiled app CSS
at desktop and phone widths. Selection layout, status/disabled explanations and
full care text were visually checked; mobile had no horizontal overflow. It was a
fixture layout review, not a signed-in end-to-end browser transaction. Actual JSX
handlers/server actions and PostgreSQL services were tested separately.

## Final boundary review

1. Booking.notes stays private to its existing surfaces because it also stores
   administrative fixture metadata and has no participant provenance contract.
2. Null version means unknown; version 1 with null text means captured-empty.
3. Public and canonical Booking creation populate version 1 from client input.
4. Old Bookings cannot activate a new participant handoff through this UI/action.
5. There is no automatic or heuristic backfill.
6. Fixture/QA metadata remains in generic notes and cannot enter participant DTOs.
7. Lead care notes and full Booking schedule are unchanged.
8. Replacement care text is read only from the trusted dedicated snapshot.
9. Replacement details/cards/routes/money contain only currently assigned Visits.
10. Messaging and whole-booking cancellation/reassignment authority did not broaden.
11. Operator UI is wired with role, locked care, financial, timing, availability and
    idempotency checks. It requires the new migration before an application release.
12. Legacy remediation needs a separately approved reviewed-care capture workflow.

Production rollout, public canonical activation, participant messaging, legacy
remediation, settlements/transfers/refunds and reward policy changes remain outside
this phase. No production activation was attempted.

## PostgreSQL results

Both URLs authenticated to the configured disposable branch before mutations.
Only the approved pending migration was deployed, only on QA. Migration status is
current. Final care-snapshot verification compared every pre-existing Booking
(excluding the two new nullable fields) and protected model counts/legacy money to
the saved baseline. All matched exactly. Existing snapshots remain null/null;
there was no backfill. The new CHECK exists. Isolated fixture cleanup passed in
every suite and the final saved-baseline check passed.

| Suite | Passed | Failed / skipped |
| --- | ---: | ---: |
| Handoff / participant access / care activation | 30 | 0 / 0 |
| Visit compensation / completion / allocation | 24 | 0 / 0 |
| Booking compensation | 23 | 0 / 0 |
| Economics readers | 13 | 0 / 0 |
| Reassignment | 37 | 0 / 0 |
| Cancellation | 26 | 0 / 0 |
| Confirmation | 21 | 0 / 0 |
| Canonical creation | 25 | 0 / 0 |
| Reward progress | 18 | 0 / 0 |
| Reward reservation | 21 | 0 / 0 |
| **Total** | **238** | **0 / 0** |

Commands: `node scripts/care-snapshot-qa.mjs apply`,
`node scripts/run-visit-compensation-regressions.mjs`, then
`node scripts/care-snapshot-qa.mjs verify`. Connection details, configured branch
identity and owner IDs were not printed. Logs, database baseline, review fixtures,
and generated Prisma/build output are excluded from the patch.

## Patch and Git

Export target: `/Users/danieltorres/Desktop/taskwhisker-care-snapshot-handoff-ui.patch`.
The export process assembles the complete tracked and untracked working diff,
checks an explicit file manifest, scans configured credentials/owner/QA identities,
verifies reverse applicability and compares file hashes/status before and after.
No staging, commit or push is performed. Production is untouched.

## Changed-file manifest

- `prisma/migrations/20260917000000_booking_care_snapshot/migration.sql`
- `prisma/schema.prisma`
- `scripts/care-snapshot-qa.mjs`
- `src/app/book/actions.js`
- `src/app/dashboard/operator/_components/VisitCoverage.jsx`
- `src/app/dashboard/operator/bookings/[id]/page.jsx`
- `src/app/dashboard/operator/bookings/handoffActions.js`
- `src/app/dashboard/sitter/_components/CoverageVisits.jsx`
- `src/app/dashboard/sitter/_components/ParticipantVisit.jsx`
- `src/app/dashboard/sitter/_components/SitterDashboardLive.jsx`
- `src/app/dashboard/sitter/_components/SitterRoutePanel.jsx`
- `src/app/dashboard/sitter/actions.js`
- `src/app/dashboard/sitter/lib/coverageRouteStops.js`
- `src/app/dashboard/sitter/page.jsx`
- `src/app/dashboard/sitter/visits/[visitId]/page.jsx`
- `src/lib/bookings/canonical/bookingContract.js`
- `src/lib/bookings/canonical/createCanonicalBooking.js`
- `src/lib/bookings/careSnapshot/contract.js`
- `src/lib/bookings/careSnapshot/contract.test.js`
- `src/lib/bookings/careSnapshot/fixtures.js`
- `src/lib/bookings/careSnapshot/writers.test.js`
- `src/lib/bookings/economics/readerSurfaces.test.js`
- `src/lib/bookings/handoff/README.md`
- `src/lib/bookings/handoff/UI_VERIFICATION.md`
- `src/lib/bookings/handoff/actionBoundaries.test.js`
- `src/lib/bookings/handoff/handoff.integration.test.js`
- `src/lib/bookings/handoff/handoff.test.js`
- `src/lib/bookings/handoff/handoffService.js`
- `src/lib/bookings/handoff/operatorSurface.js`
- `src/lib/bookings/handoff/participantSurface.js`
- `src/lib/bookings/handoff/participation.js`
- `src/lib/bookings/handoff/surfaces.test.js`
- `src/lib/bookings/surfaceTestSupport.js`
