# Selected-Visit handoff verification

Base: clean main at `3b45f101b76f560099de52ca8400dee7cf1a1d33`.
Local HEAD, cached origin/main and live origin/main matched before edits and on
final remote verification. Nothing staged, committed, pushed or deployed.
No schema or migration files changed.

## Tests and build

Pure suite: **768 passed, 0 failed**. Ten PostgreSQL parent tests are skipped in
that invocation and run separately against authenticated disposable QA.
PostgreSQL suites: **237 passed, 0 failed, 0 skipped**.
Combined: **1005 passing tests** (node:test totals include PostgreSQL suite parents).

| PostgreSQL suite | Passed |
| --- | ---: |
| Selected handoff and participant access | 29 |
| Visit authorization/allocation/readiness | 24 |
| Booking compensation | 23 |
| Economics/completion readers | 13 |
| Whole-booking reassignment | 37 |
| Cancellation | 26 |
| Confirmation | 21 |
| Canonical creation | 25 |
| Reward progress/grants | 18 |
| Reward reservations | 21 |

Commands: `node --test src/lib/**/*.test.js` and
`node scripts/run-visit-compensation-regressions.mjs`. Database suites run
sequentially to avoid overlapping protected-state baselines. The HANDOFF selector
also reran the new suite after strengthening its started-care fixture. That case
seeds valid historical authorization on isolated fixture rows, proves readiness
is valid, then requires HANDOFF_AFTER_START_REQUIRES_REVIEW specifically. There
is no production history-rewrite helper.

The new tests cover one/multiple selected units, immutable unselected/earned
history, unchanged lead and commitment, new revisions, one audit event, replay
and conflicting payloads; terminal/started/performed/allocated/canceled rejection;
default/override/pet/owner economics; reward noninheritance and legitimate return;
overlap rejection, back-to-back and cross-midnight; bounded DTOs, roles, removal,
wrong-Visit completion and participant cancellation denial; frozen replacement
allocation, prior earnings preservation, split completion and no split reward
credit; and forced rollback after authorization, assignment and history writes.

Synchronized races observe actual PostgreSQL lock contention with pg_blocking_pids:
- handoff versus final Visit completion/allocation/Booking completion, both orders;
- handoff versus whole-booking cancellation, both orders;
- handoff versus missed review of future care, both orders (review correctly rejects
  non-overdue care; the independent started-care gate rejects handoff after start);
- duplicate handoff key yields one revision and stable receipt;
- different concurrent handoffs yield one unbroken revision chain.
Existing suites additionally cover overdue missed-review versus completed allocation,
reward transitions/capacity, confirmation availability and whole-assignment races.

Participant tests inspect allowlisted fields and own amounts and reject unassigned
actors. Existing rendered-surface tests retain participant denial at the lead page.
Lead-visibility correction: the 54 focused handoff unit/reader/render tests pass.
They prove the lead's whole schedule and replacement names remain visible, while
replacement completion controls and money are absent. Personal dashboard lists,
route actions and estimated earnings remain own-assignment only; a replacement-only
schedule contributes no lead earnings. Single-sitter behavior remains unchanged.
The participant DTO explicitly routes LEAD to the existing lead path. PostgreSQL
assertions additionally preserve participant cancellation denial, reject lead
completion of replacement care, and verify both financial projections.
The route projection preserves the original-commitment financial label.
No participant UI was introduced, so there is no claim of end-to-end participant
browser acceptance. That remains an explicit activation prerequisite.

Targeted ESLint: zero errors/warnings. Prisma validate and Client generation
(5.22.0): passed. Production npm run build: passed. The first sandbox build failed
to fetch existing Google Fonts; the network-enabled final build succeeded.
Subsequent changes were tests/documentation only. git diff --check: passed.

## Disposable QA and cleanup

Every database suite authenticates DATABASE_URL and DIRECT_URL to the configured
TASKWHISKER_QA_BRANCH_ID and rejects the shared branch before mutation. Actual
configured identities and credentials are not printed. Fixtures use isolated
synthetic identities and every suite restores its protected counts and legacy
money exactly. The final `node scripts/visit-compensation-qa.mjs verify` checks the
saved pre-foundation baseline, all five financial tables empty, owner configuration,
deployed CHECKs and migration status up to date. Its migrationApplied flag refers
to the already-applied foundation migration; no migration was applied in this phase.

Protected nonzero counts before and after: Client 11; Booking 46; BookingLineItem
57; Visit 49; BookingHistory 77; BlockedClient 2; User 4; Conversation 27; Message
75; ConversationParticipant 13; Service 20. All other model counts are zero,
including all five Visit financial models. Legacy money remains unchanged.

## Patch and activation boundary

Export: `/Users/danieltorres/Desktop/taskwhisker-selected-visit-handoff-access.patch`.
The export checks the complete tracked/untracked diff and exact file manifest,
reverse applicability, configured secret/owner/QA identity exclusion, no env or
schema/migration files, and unchanged source hashes. Temporary logs/baselines and
generated Prisma artifacts are excluded. No Git staging occurs during export.

The writer and participant DTO are internal/unwired. Existing lead messaging and
cancellation permissions are unchanged. Operational activation requires the
selected-unit operator picker and dedicated participant detail/list/route/earnings
UI, care-note review, and browser acceptance. Messaging history remains restricted.
See [the contract and audit](README.md) for policy and all activation prerequisites.

## Complete changed-file manifest
- `scripts/run-visit-compensation-regressions.mjs`
- `src/app/dashboard/operator/bookings/[id]/page.jsx`
- `src/app/dashboard/sitter/_components/SitterDashboardLive.jsx`
- `src/app/dashboard/sitter/bookings/[id]/page.jsx`
- `src/app/dashboard/sitter/lib/sitterDashboardUtils.js`
- `src/app/dashboard/sitter/page.jsx`
- `src/lib/bookings/cancellation/canonicalCancellation.js`
- `src/lib/bookings/economics/bookingEconomics.js`
- `src/lib/bookings/economics/completionService.js`
- `src/lib/bookings/economics/readerSurfaces.test.js`
- `src/lib/bookings/handoff/README.md`
- `src/lib/bookings/handoff/VERIFICATION.md`
- `src/lib/bookings/handoff/contract.js`
- `src/lib/bookings/handoff/economics.js`
- `src/lib/bookings/handoff/handoff.integration.test.js`
- `src/lib/bookings/handoff/handoff.test.js`
- `src/lib/bookings/handoff/handoffService.js`
- `src/lib/bookings/handoff/participation.js`
- `src/lib/bookings/visitCompensation/README.md`
- `src/lib/bookings/visitCompensation/contract.js`
