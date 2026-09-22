# Bridget schedule MVP — implementation and verification

Implemented on `feature/bridget-schedule`, created from clean `main` at
`620f30cd5e56f3d61b7a78f0b75340105c0b0ee9`. This checkpoint adds no schema
changes or migrations. Verification used a dedicated disposable local PostgreSQL
database with synthetic data. No production access, push, or deployment was performed.

## Delivered behavior

- `/dashboard/schedule`: protected Month calendar (default), Day/Today and Sunday–Saturday Week agenda,
  chronological cards, previous/next navigation, reliable Today reset, empty days,
  and Add Booking. Reads persisted Visit assignments and intervals, so public and
  manual visits appear together. Overnight visits appear on each intersected day.
- Month includes complete Sunday–Saturday weeks and adjacent-month dates. Native
  date links open the Day agenda; Today and the explicitly selected date have
  separate accessible labels and visual treatments. Compact P/C/D/X counts have
  a text legend; a continuation arrow marks visits beginning on a prior date.
  Empty cells do not imply availability. Month makes one authorized interval query
  selecting only Visit ID, start/end and status, then returns date/count aggregates.
  It does not load client, pet, care, address or financial details.
- `src/lib/calendar/calendarRange.js` and the rendering components in
  `src/components/calendar/` are independent of Bridget's authorization and accept
  authorized data and navigation labels. No tenancy/availability models were added.
- `/dashboard/schedule/new`: existing-client search or name-only new client,
  active Service selection, dated visits with service-derived duration, overnight
  arrival/departure, optional existing pets, optional extras, and care notes.
- Explicit server-priced review precedes final Save Booking. Editing details,
  expired review, altered input, or changed catalog pricing requires a new review.
- Client, Booking, Visits, BookingPets, line items and actor-attributed history are
  persisted together. Manual creation calls no messaging, email, payment, or
  geocoding code. Addresses remain optional and no coordinates are fabricated.

## Authorization and ownership

`src/lib/schedule/access.js` is the shared authorization policy for agenda reads,
client/service search, price review, and final creation. It resolves the existing
configured owner pair and validates both User roles in the database. Only the
configured owner OPERATOR or that owner's linked SITTER may proceed. An arbitrary
OPERATOR or SITTER is denied. Browser assignment IDs and role claims are ignored.
Every save repeats identity validation inside its transaction.

Both accounts may select clients with a Booking owned by the configured operator.
There is no global-client enumeration, arbitrary client-ID access, or silent
email upsert. Client records without an owned booking are not exposed because
Client has no direct ownership column. New-client email collisions prompt selection
of the existing authorized client; existing client details are never overwritten.
Selected pets must belong to that client and be unarchived. Pet selection is optional.

The agenda displays Visits owned by the configured operator and assigned to the
configured sitter. Booking lead identity is not substituted for Visit assignment.
Navigation visibility uses configured IDs only as a display hint; routes and
server actions independently enforce the database-backed policy. Unauthenticated
requests follow the existing requireAuth login redirect. Other accounts receive
an unavailable page/action error without any schedule/client data.

## Pricing and dates

The active legacy Service pricing contract is retained: Service.basePriceCents
multiplied by visit/night count, plus explicitly selected EXTRA service quantities.
Extra quantities apply to the entire booking. Selecting pets does not automatically
add extra-pet charges; the form explains this and provides optional extras.

The existing platform split remains round(total × 10%), with the remainder as
sitter payout. Bridget sees the total and both shares before saving. The newer
canonical owner-zero-fee economics are not activated. Browser-supplied totals,
service names, fee values, and assignment IDs are not authoritative for manual entry.
Rates and active service status are reloaded at save time.

A 30-minute HMAC review token binds normalized choices, actor, configured identities,
and calculated pricing. Its server-created Booking ID also provides retry
idempotency without schema changes. Successful replay creates no duplicate history
or visits. NEXTAUTH_SECRET must be configured (at least 16 characters).

Existing canonical schedule normalization/generation is reused through a Service
adapter; no second scheduling engine or canonical creation activation was added.
Timed visits retain the 07:00–22:00 guard and match the selected service duration.
Overnights use the existing arrival-inclusive/departure-exclusive nightly windows.
Manual saves must finish before their first visit starts, using database time.

The existing IANA wall-time conversion was extracted into a browser-safe shared
module, retaining canonical error behavior. New schedule code consistently uses
America/New_York. DST gaps/folds are rejected. Month/day/week navigation advances calendar
dates, not fixed elapsed 24-hour periods. Conflict buffers use elapsed milliseconds.

## Conflict protection and public correction

Public and manual creation now run availability reads and writes in the same
Serializable transaction, retrying complete transactions on P2034. Both use the
existing PENDING/CONFIRMED Visit predicates and a 15-minute buffer against existing
bookings. Manual input also rejects internal duplicate/overlapping visits through
the existing generator; no travel buffer is added between units of one booking.

The public precheck remains as an early warning. A conflict found inside its
transaction returns the existing public error shape, with no writes or notifications.
Existing public submitted-price behavior, extras, date conversion, lifecycle, history,
and post-commit emails remain unchanged. Shared price arithmetic is extracted without
changing that contract. Existing confirmation/reassignment policies are untouched.

Manual conflicts identify the existing visit's New Jersey date/time without
exposing another client's name. Serializable/unique retries are bounded. Manual
unique-key retries support simultaneous submission of the same signed review.

## Offline typography

No licensed tracked Geist files or locked offline font package were present.
The root layout therefore uses system sans-serif and monospace stacks, preserving
both `--font-geist-sans` and `--font-geist-mono`. No dependency or binary was added.
Focused regression coverage checks the rendered layout and both CSS variables.

## Verification completed (2026-09-20)

- Complete non-integration suite: **899 passed, 0 failed, 0 skipped**.
- Focused schedule/calendar/care suite: **78 passed, 0 failed, 0 skipped**.
- The same focused suite under `TZ=Asia/Tokyo`: **78 passed**.
- Guarded PostgreSQL integration: **1 passed**, including public/manual contention,
  concurrent replay, and conflict rollback; all test fixtures were removed.
- Extended isolated database checks covered 14/15-minute buffer boundaries,
  two-visit pricing/pet snapshots, late-write rollback, access denial, and persisted
  DST/midnight/year-boundary intervals. These passed before the font-only adjustment.
- Targeted ESLint: **34 JavaScript/JSX files**, no errors or warnings.
- `git diff --check`: passed.
- Full `npm run build`: **passed**, including catalog prerender, with both database
  variables bound to the verified loopback QA identity and OS-level outbound
  network denial except loopback. No Google Fonts dependency remains. The existing
  DaisyUI `@property --radialprogress` CSS warning is nonfatal.
- Authenticated production-mode browser smoke at **390 × 844** and **1440 × 900**:
  operator and linked-sitter dashboard navigation, default Month, Month/Week/Day,
  date navigation, New York Today marker, Month-to-Day selection, Quick Add and
  server price review passed. Both font variables resolved; inspected surfaces had
  no horizontal overflow, clipping, or browser console/hydration warnings.
- A mobile two-visit booking with optional pet and extra quantity 2 reviewed at
  **$66.00**, platform share **$6.60**, sitter payout **$59.40**. Double-clicking Save
  persisted exactly one booking, two visits, two line items, one pet snapshot and
  one history record. Overlap and ten-minute-gap attempts were rejected without
  additional writes. Conflict copy exposed only the local interval.
- Unrelated sitter/operator accounts had no Schedule link and were denied direct
  access. The unrelated sitter was also denied the Quick Add route.
- Manual smoke produced no email, messaging, geocoding, payment or external-network
  attempts. Runtime egress auditing and OS network isolation remained active.
- Smoke records were removed. All retained baseline counts matched: four users,
  four services, one client, one pet, one booking, one visit, and zero booking-pet,
  line-item, history, conversation or message records. The QA app and dedicated
  PostgreSQL server were stopped while preserving the synthetic database.

## Repeating isolated database QA

Use only an explicitly approved disposable local database. This checkpoint used
`127.0.0.1:55439/taskwhisker_schedule_qa`; validate the parsed effective URL and the
server-reported database/host/port before reads or writes. Do not inherit repository
`.env` datasource URLs. Both `DATABASE_URL` and `DIRECT_URL` must equal the verified
QA URL. Keep credentials outside the repository and out of logs. Deny outbound
network access except loopback; configure synthetic authentication identities.

The opt-in integration test never loads `.env`, defaults to a production URL, or
runs DDL. It requires a loopback URL ending in `_schedule_qa`, creates isolated
fixtures, and removes them. The external QA runner additionally enforced the exact
port and database above. Verify retained baseline counts before and after it.

```sh
TASKWHISKER_SCHEDULE_QA_TESTS=1 node --test src/lib/schedule/schedule.integration.test.js
DATABASE_URL="$TASKWHISKER_SCHEDULE_QA_URL" DIRECT_URL="$TASKWHISKER_SCHEDULE_QA_URL" npm run build
```

The synthetic configured owner pair and default public sitter were verified through
the actual identity contracts. This does **not** verify Bridget's real accounts.
Before deployment, an authorized environment check must prove that the real
configured operator and sitter IDs exist, are distinct, have the expected roles,
and match the intended default public sitter. Deployment remains a separate step.

## Manual mobile QA checklist

- Sign in separately as Bridget operator and linked sitter; each sees the schedule
  link and the same agenda. Logged-out access redirects. Unrelated OPERATOR/SITTER
  accounts cannot load schedule data or call search/review/save successfully.
- At approximately 390px width, verify Day/Week/Today, previous/next week across
  month/year/DST boundaries, empty days, and existing public visits. Overnight
  cards must appear on both intersected dates without shifting by a day.
- Select an existing client; optionally select its pet. Create two dated visits,
  review the server total, save once, and confirm one Booking, two Visits, correct
  snapshots/line items and actor history. Inspect a name-only new-client booking too.
- Select an overnight service across a DST change and confirm nightly quantity,
  dates and actual intervals. Attempt duplicate or overlapping input visits.
- Add an extra with quantity 2; verify exactly two charges, shown before saving.
  Change the service rate after review: Save must reject and require fresh review.
- Attempt an occupied interval and one within 15 minutes of another booking; the
  error must identify the local conflicting date/time and create no new records.
- Submit competing manual/public bookings concurrently on QA and verify only one
  claims the conflicting interval. Double-tap/retry the same reviewed manual save:
  only one booking/history set must exist.
- Check optional blank pets/contact/address/notes. Try foreign/archived pet IDs and
  an unauthorized client ID through a direct action call; the server must reject.
- Confirm manual creation produces zero outbound notifications/geocoding/payment
  requests. Verify public success still produces its usual post-commit notifications
  once through a QA delivery sink.

## Remaining limitations

Real Bridget identity verification remains pending. The completed synthetic
PostgreSQL and browser checks do not substitute for that deployment gate. System
font metrics vary by operating system; smoke QA covered the local browser only.

Preexisting public date parsing/fixed-offset slot presentation remains unchanged,
so this work does not correct historical or newly public-created timestamp mistakes.
New manual entry and agenda conversion use IANA business time. Unowned/orphan client
records require a future explicit ownership workflow. There is no past-booking
backfill, recurring automation, external calendar sync, drag/drop, route optimization,
or dispatch expansion in this release.

## Files changed

Existing files:

- `src/app/book/actions.js` — shared pricing and authoritative transactional conflict check.
- `src/app/dashboard/operator/layout.jsx` — conditional schedule entry link.
- `src/app/dashboard/sitter/layout.jsx` — conditional schedule entry link.
- `src/app/layout.js` — remove build-time Google Fonts requests.
- `src/app/globals.css` — preserve font variables with offline system stacks.
- `src/lib/blocklist/checkBlockedClient.js` — production wrapper around reusable blocklist logic.
- `src/lib/bookings/canonical/bookingContract.js` — shared wall-time conversion with preserved errors.
- `src/lib/bookings/careSnapshot/writers.test.js` — transaction availability fixture support.
- `src/lib/calendar/checkAvailability.js` — production wrapper around shared availability logic.

New files:

- `src/app/dashboard/schedule/ScheduleLink.jsx`
- `src/app/dashboard/schedule/actions.js`
- `src/app/dashboard/schedule/page.jsx`
- `src/app/dashboard/schedule/new/page.jsx`
- `src/app/dashboard/schedule/new/ManualBookingForm.jsx`
- `src/lib/blocklist/blockedClientContract.js`
- `src/lib/bookings/legacyPricing.js`
- `src/lib/calendar/availabilityContract.js`
- `src/lib/calendar/bookingTransaction.js`
- `src/lib/calendar/bookingTransaction.test.js`
- `src/lib/calendar/businessTime.js`
- `src/lib/calendar/calendarRange.js`
- `src/lib/calendar/calendarRange.test.js`
- `src/lib/calendar/offlineFonts.test.js`
- `src/components/calendar/MonthCalendar.jsx`
- `src/components/calendar/ScheduleCalendar.jsx`
- `src/lib/schedule/access.js`
- `src/lib/schedule/agenda.js`
- `src/lib/schedule/agenda.test.js`
- `src/lib/schedule/fixtures.js`
- `src/lib/schedule/manualBooking.js`
- `src/lib/schedule/manualBooking.test.js`
- `src/lib/schedule/month.test.js`
- `src/lib/schedule/publicBookingRegression.test.js`
- `src/lib/schedule/schedule.integration.test.js`
- `src/lib/schedule/surfaces.test.js`
- `src/lib/schedule/README.md`

## Review polish regression checks

The manual form wraps long labels locally and associates server validation with
controls. Error keys are generated from the submitted array positions by the
server. Editing clears only the changed control and explicitly dependent interval
errors. Unrelated errors keep their associations, and the announced validation
summary reflects the remaining messages until the last one clears. Added rows
preserve errors; removed rows remap errors with their surviving visits. Extra
errors use the submitted code locally so quantity removal cannot shift them.
Address and Extras have independent open state; new errors reopen a closed section.
Authoritative catalog-duration errors use server-only submitted-order metadata
(without changing signed input JSON), marking only failing time controls. Unknown
schedule errors remain general. Conflict, retry and review-token failures remain
general alerts. Input normalization is isolated in `manualInput.js`; database
queries, pricing and transaction/write behavior remain unchanged.

Calendar civil dates retain the shared 2000–9999 range. A displayed view must fit
its full grid and exclusive query endpoint inside that range. Incomplete boundary
views reset to New York Today, just like malformed links; Previous/Next controls
are disabled when their destination cannot be displayed. Queries remain at most
42 calendar days. January 2000 and December 9999 Month URLs therefore reset safely.

After an offline production build, run the database-free browser regression:

```sh
SCHEDULE_BROWSER_MODULE=/absolute/path/to/installed/playwright/index.mjs \
SCHEDULE_BROWSER_EXECUTABLE=/absolute/path/to/installed/browser \
SCHEDULE_VISUAL_OUTPUT=/absolute/path/outside/repository \
node src/lib/schedule/manualForm.browser.mjs
```

The module/executable overrides are optional when Playwright and its browser are
already installed normally. No dependencies or browsers are downloaded. The runner
uses actual components and built CSS with synthetic hook/action state, aborts page
network requests, and checks 390×844 and 1440×900 layouts. Screenshots are optional
and must remain outside the repository. Unit tests separately exercise the real
form's handlers, error clearing, and row removal with an in-memory action seam.


For live mounted-React interaction QA, use the same three environment variables
(the installed module and browser paths are required) with:

```sh
node src/lib/schedule/manualForm.live.browser.mjs
```

This fixture bundles the actual form, UI primitives and recovery helpers using
already installed React and Next/SWC. Only initial synthetic state, navigation and
actions are substituted. The action invokes production input normalization,
authoritative schedule derivation and error serialization in memory. Native HTML
validation is disabled only in this fixture to exercise server rejection. Sixteen
mobile/desktop cases cover multi-error recovery, independently controlled
disclosures, submitted-order duration mapping, dynamic rows, general failures,
keyboard focus and document overflow. No database or network service is used.
