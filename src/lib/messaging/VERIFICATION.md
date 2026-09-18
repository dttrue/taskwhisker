# Participant messaging verification

## Checkpoint and boundaries

Started on clean `main` at `1318f3a0dd52ec4ec36a8f583029d14a6be2ed17`, matching
`origin/main`. No commit, push, deployment or production database mutation.
The approved migration was applied only after both configured database URLs
were authenticated to the disposable QA branch.

## Schema and assignment

One new migration: `20260918000000_visit_participant_messaging`.
Existing Conversation/Message/read-state IDs and values were preserved. Existing
Visits start at revision 1; no historical coverage threads were manufactured.
Partial uniqueness enforces one BOOKING thread. Composite Visit/Booking foreign
keys and scope checks enforce context consistency. Coverage identity is immutable.
Database triggers advance assignment tenure on actual sitter change only and
validate coverage sender identity, role and strictly increasing message timestamps.

All runtime assignment writers were audited: initial canonical and legacy Visit
creation use revision 1; whole-booking assignment/unassignment and selected handoff
are covered atomically by the database trigger. Same-sitter writes and handoff
replays do not increment. Direct repair updates cannot bypass advancement.

## Final automated checks

| Suite | Passed |
|---|---:|
| All unit and rendered surface tests | 853 |
| Messaging PostgreSQL | 13 |
| Handoff PostgreSQL | 34 |
| Visit compensation PostgreSQL | 24 |
| Compensation PostgreSQL | 23 |
| Economics reader PostgreSQL | 13 |
| Reassignment PostgreSQL | 37 |
| Cancellation PostgreSQL | 26 |
| Confirmation PostgreSQL | 21 |
| Canonical booking PostgreSQL | 25 |
| Reward progress PostgreSQL | 18 |
| Reward reservation PostgreSQL | 21 |
| Total PostgreSQL | 255 |

The messaging suite exercises direct IDs, authenticated sender identity, lead/client/
anonymous/former denial, different-Visit isolation, returning-sitter isolation,
concurrent lazy creation, actual Booking loaders/sends/change requests, independent
unread counts above 50, delivered boundaries, terminal lifecycle and a send proven
by `pg_blocking_pids` to wait on a reassignment transaction before denial.

A previous reassignment run timed out during a forced race; its cleanup completed,
and an unchanged rerun passed all 37 checks. An early fixture cleanup detected a
shared synthetic client and rolled back; the fixture factory now uses unique
email-only identities. Recovery verified every pre-existing row unchanged. Final
messaging runs restored protected counts and all pre-existing messaging/Visit data
exactly. The preserved visual-review fixture was not modified.

Targeted ESLint, Prisma validate/generate, production build and `git diff --check`
passed. The build required network access for the existing Google font downloads.
No dependency or lockfile changes were needed.

## Browser review

Nine screenshots were captured and visually inspected under
`Desktop/taskwhisker-ui-review/participant-messaging/`:

1. `01-coverage-visit-detail.png`
2. `02-sitter-coverage-inbox.png`
3. `03-active-thread-desktop.png`
4. `04-active-thread-mobile.png`
5. `05-operator-inbox.png`
6. `06-operator-thread.png`
7. `07-completed-read-only-mobile.png`
8. `08-canceled-read-only-desktop.png`
9. `09-revoked-thread.png`

An isolated headless Chrome session used authenticated synthetic sitter/operator
accounts against a local production build. Real form submission, operator reply,
visible polling, terminal composer removal and live reassignment revocation passed.
Lead direct-thread URL access was denied. No historical Booking message appeared.
Desktop and 390px mobile widths had no horizontal overflow. Mobile interactions
were exercised at 390×844; full-page captures use the same width with expanded
height so the fixed navigation does not obscure the screenshot's content.
The local server and browser were stopped and all visual fixtures were cleaned;
protected counts and pre-existing messaging/Visit data exactly matched baseline.

## Final access review

- Coverage sitters cannot load any BOOKING or another tenure's messages.
- Former sitters lose read/send/poll access; a return assignment gets a new revision.
- Lead and client receive no automatic access or membership.
- Database constraints enforce parent consistency and thread uniqueness.
- Delivered read boundaries are independent and do not swallow concurrent messages.
- Direct IDs do not bypass server authorization.
- Terminal participant threads are read-only; current terminal operator replies
  preserve existing operator policy. Superseded operator threads are read-only.
- Financial/cancellation/reassignment authority is unchanged.
- Lazy messaging creation cannot roll back a completed financial handoff.

## Delivery boundaries

The patch includes the new approved migration and no prior migration edits, secrets,
environment files, screenshots or generated artifacts. It is checked for reverse
applicability against the worktree and forward applicability against the checkpoint.
The export process compares resulting files and verifies that source is unchanged.

Legacy BOOKING unread behavior remains unchanged; the new coverage system has
accurate incoming counts and delivered-message cursors. Live revocation appears at
the next visible poll (15 seconds) or focus check, while server access is denied as
soon as reassignment commits. Coverage discovery is currently unpaginated.

## Changed files

- `prisma/migrations/20260918000000_visit_participant_messaging/migration.sql`
- `prisma/schema.prisma`
- `scripts/participant-messaging-qa.mjs`
- `scripts/run-participant-messaging-checks.mjs`
- `src/app/api/coverage-messages/poll/route.js`
- `src/app/api/messages/poll/route.js`
- `src/app/api/sitter/unread-messages/route.js`
- `src/app/client/bookings/[clientLinkToken]/actions.js`
- `src/app/client/bookings/[clientLinkToken]/messages/actions.js`
- `src/app/dashboard/messages/actions.js`
- `src/app/dashboard/operator/_components/OperatorNavigation.jsx`
- `src/app/dashboard/operator/bookings/actions.js`
- `src/app/dashboard/operator/messages/[threadId]/page.jsx`
- `src/app/dashboard/operator/messages/page.jsx`
- `src/app/dashboard/operator/operations/page.jsx`
- `src/app/dashboard/operator/visits/[visitId]/messages/page.jsx`
- `src/app/dashboard/sitter/lib/sitterDashboardUtils.js`
- `src/app/dashboard/sitter/messages/[bookingId]/approveCancellationActions.js`
- `src/app/dashboard/sitter/messages/actions.js`
- `src/app/dashboard/sitter/messages/page.jsx`
- `src/app/dashboard/sitter/page.jsx`
- `src/app/dashboard/sitter/visit-messages/[threadId]/page.jsx`
- `src/app/dashboard/sitter/visit-messages/actions.js`
- `src/app/dashboard/sitter/visits/[visitId]/messages/page.jsx`
- `src/app/dashboard/sitter/visits/[visitId]/page.jsx`
- `src/components/messaging/CoverageInbox.jsx`
- `src/components/messaging/CoverageInboxRefresh.jsx`
- `src/components/messaging/CoverageThread.jsx`
- `src/lib/bookings/businessOwnerIdentity.test.js`
- `src/lib/bookings/cancellation/canonicalCancellation.js`
- `src/lib/bookings/cancellation/canonicalCancellation.test.js`
- `src/lib/bookings/confirmation/confirmationService.js`
- `src/lib/bookings/handoff/handoffService.js`
- `src/lib/messaging/README.md`
- `src/lib/messaging/VERIFICATION.md`
- `src/lib/messaging/bookingThread.js`
- `src/lib/messaging/coverage.integration.test.js`
- `src/lib/messaging/coverage.js`
- `src/lib/messaging/coverage.test.js`
- `src/lib/messaging/coverageServer.js`
- `src/lib/messaging/createSystemMessage.js`
- `src/lib/messaging/getBookingConversation.js`
- `src/lib/messaging/getClientBookingConversation.js`
- `src/lib/messaging/getSitterConversations.js`
- `src/lib/messaging/getUnreadMessageCountForSitter.js`
- `src/lib/messaging/qaFixtures.js`
- `src/lib/operations/loadOperatorInterventions.js`
