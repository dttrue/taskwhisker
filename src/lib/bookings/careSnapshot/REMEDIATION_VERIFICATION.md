# Legacy care-instruction remediation

## Initial audit and checkpoint

Initial audit completed before edits. Clean `main`, cached `origin/main`, and live
`origin/main` matched `596de03c8908a637232f2629603e94764263be03`.
No schema or migration changes were needed. No commit, push, or deployment.

BookingHistory provides `bookingId`, `changedByUserId`, `createdAt`, and `note`.
Its nullable status/assignment fields permit a care-only metadata event without
pretending to change status or assignment. Existing handoff mutations demonstrate
operator authentication, authoritative role checks, Booking row locks, transactional
history writes, and operator/sitter revalidation. The care mutation follows those
patterns. The existing database CHECK and reader contract support only null and
version 1; no future format is silently accepted or downgraded.

The public booking action and canonical creation writer capture care from explicit
creation input. Historical `Booking.notes` also contains administrative seed/QA
metadata, and is retained by the original lead view. It is never a trusted source
for the replacement participant projection. No runtime operator care editor existed.

## Contract and workflow

The operator Booking detail page shows read-only Historical booking notes beside a
separate Care instructions for sitters field. Legacy forms start blank. Already
trusted forms start with their approved care text and are marked ready. The operator
must explicitly approve, after a notice that instructions may be shown to assigned
sitters. Empty approval is allowed and displayed as “Reviewed: no additional care
instructions.” Saving never copies or rewrites historical notes.

The action requires authenticated OPERATOR, uses session actor identity, and
allowlists only bookingId, careInstructions, and an opaque review operationId.
The database service rechecks the persisted actor role. It trims the explicitly
submitted text, rejects non-text and normalized text over 1000 characters, and
writes version 1 plus normalized text or null. Version is never accepted from the
browser. The existing creation capture helper remains creation-only.

## Audit, concurrency and replay

Each real change writes one BookingHistory row in the same transaction as the
snapshot, recording the actor, database-default timestamp, and a note:

`CARE_INSTRUCTIONS_APPROVED · manual legacy review · non-empty`

Subsequent edits use `manual approved-care edit`; empty content uses `empty`.
Neither full source notes nor approved care text is duplicated in history.

The rendered review operationId is a SHA-256 digest of booking identity, care
snapshot version/text, and the sorted IDs of all care-approval history entries.
The IDs prevent an A → B → A edit cycle from making an old form current again.
This is an optimistic concurrency key, not an authorization credential or a client
version selector. Every real approval contributes a durable history ID.

A ReadCommitted transaction obtains the existing Booking `FOR UPDATE` lock before
reading the current snapshot and history. A competing save waits, then sees the
committed state. If content already matches its normalized intent at version 1,
it returns success without updating timestamps or adding history. Otherwise a
mismatched review key returns a clean conflict asking the operator to refresh.
A later replay cannot resurrect superseded text. History failure rolls back the
snapshot. The transaction changes no financial, assignment, Visit, reward, or
access records.

## Handoff and participant boundary

Successful action saves revalidate the Booking detail, operator dashboard, and
sitter layout. The client refreshes server rows. Visit Coverage uses the unchanged
`participantCareReady` and existing handoff validation. Version 1 clears only the
care blocker; confirmation, finances, authorizations, timing, and availability are
still required. No handoff guard is bypassed.

Replacement sitters receive only `careInstructions` through the existing bounded
participant DTO. Original notes, history, and broad Booking data are not added.
Lead behavior and existing lead notes remain unchanged. Sitters cannot access the
operator page or approval action.

## Verification

- Full unit/action/render suite: 819 passed, zero failed/skipped; includes 17 focused
  remediation tests, care writer/readiness tests, operator page regression,
  participant access, lead rendering, and handoff economics/access regressions.
- PostgreSQL handoff/remediation suite: 34 passed, zero failed/skipped. Includes
  real approval, intentionally empty edit, replay, stale edit rejection, actor
  denial, exact notes preservation, bounded participant projection, metadata
  audit, history-failure rollback, and synchronized identical/different save races.
- PostgreSQL canonical creation suite: 25 passed, zero failed/skipped.
- Both QA URLs authenticated with `authenticateCanonicalQa()` before mutation.
  Suite fixtures cleaned; protected state restored exactly.
- Signed-in operator browser QA at 1440×1000 and 390×844: legacy blank editor,
  source notes, non-empty approval, duplicate replay, empty approval, and automatic
  enabled coverage verified. Mobile document width and scroll width both 390px.
  UI saves independently verified in PostgreSQL: exactly two metadata events,
  unchanged notes and assignment, version 1/null after empty approval.
- Disposable UI fixture removed. All protected model counts and legacy money
  returned to its saved baseline. The pre-existing visual fixture Booking,
  history, and Visits were compared exactly and remain unchanged. Its synthetic
  client was reused by canonical identity matching and preserved during cleanup.
- Targeted ESLint: no errors or warnings. Prisma validate/generate passed.
  Authenticated QA migration status is up to date; no migrations applied.
- Production build passed. Initial sandboxed attempt could not fetch Google Fonts;
  network-enabled retry passed. `git diff --check` passed.

Commands: `node --test` for all non-integration test files;
`node scripts/run-visit-compensation-regressions.mjs HANDOFF`;
`node scripts/run-visit-compensation-regressions.mjs CANONICAL`;
targeted `npx eslint`; `npx prisma validate`; `npx prisma generate`;
authenticated `prisma migrate status`; `npm run build`; `git diff --check`.

## Screenshots

Saved under `/Users/danieltorres/Desktop/taskwhisker-ui-review/care-remediation/`:

1. `01-legacy-before-review.png`
2. `02-historical-notes-and-empty-editor.png`
3. `03-approved-nonempty.png`
4. `04-approved-empty.png`
5. `05-coverage-ready.png`
6. `06-mobile-review.png`
7. `07-mobile-approval-controls.png`

These are signed-in screenshots of the real application using disposable synthetic
booking data, not a standalone mockup. The temporary browser tab was closed and
viewport overrides reset after review.

## Changed files and patch

- `src/app/dashboard/operator/_components/CareInstructionsReview.jsx`
- `src/app/dashboard/operator/bookings/[id]/page.jsx`
- `src/app/dashboard/operator/bookings/careActions.js`
- `src/lib/bookings/careSnapshot/REMEDIATION_VERIFICATION.md`
- `src/lib/bookings/careSnapshot/remediation.js`
- `src/lib/bookings/careSnapshot/remediation.test.js`
- `src/lib/bookings/handoff/handoff.integration.test.js`
- `src/lib/bookings/surfaceTestSupport.js`

Patch target: `/Users/danieltorres/Desktop/taskwhisker-legacy-care-remediation.patch`.
The exporter requires exactly these eight files, combines tracked and new-file
diffs, checks reverse applicability, checks configured sensitive values, and
compares source digests before/after export. Screenshots, secrets, environment
files, generated artifacts, schema, and migrations are excluded.

## Remaining limitations

Approval is intentionally manual and limited to 1000 normalized characters. It
cannot make an otherwise ineligible booking handoff-ready. This phase does not
change lead notes or deploy/activate production behavior. No known outstanding
implementation or QA blocker remains.
