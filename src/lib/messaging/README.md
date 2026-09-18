# Visit-scoped participant messaging

## Scope and authority

Historical conversations have scope `BOOKING`. Every historical read, write,
client-token route, unread query, polling query, cancellation/change request,
and system-message helper explicitly selects this scope. `Booking.conversations`
is a collection; the database still permits only one historical thread per Booking.
Existing Conversation, Message and ConversationParticipant IDs are preserved.

Coverage conversations have scope `COVERAGE_VISIT` and immutable Booking, Visit,
coverage sitter and assignment revision identity. A composite foreign key enforces
that the Visit belongs to the Conversation's Booking. A unique index enforces one
thread per Visit/revision. Scope-dependent CHECK constraints prevent incomplete or
mixed context. Creation validates the current tenure and sitter role in PostgreSQL.

Only the authenticated current SITTER assigned to that exact Visit and revision,
or an OPERATOR, can access a coverage thread. Participant records are read cursors,
not authorization grants. Lead status and client tokens grant no coverage access.
An operator can inspect historical tenures; a former sitter cannot. Returning to
the same sitter creates a new tenure and never reopens an earlier thread.

Coverage loaders use an explicit field projection: Visit time, pet/client label,
coverage sitter name, scope/lifecycle metadata and this thread's messages. They
never return raw Booking, Client, financial, reward, care-note or compensation rows.
Messaging does not change cancellation, reassignment or financial authority.

## Assignment revisions and concurrency

Every Visit starts at assignment revision 1, including existing Visits migrated
in place. PostgreSQL's `Visit_assignment_revision` trigger owns advancement:
`NEW.sitterId IS DISTINCT FROM OLD.sitterId` increments exactly once; every other
assignment-revision update retains the old value. Application code must not
increment independently. This covers selected handoff, whole-booking assignment,
unassignment, direct updates and repair SQL. Initial creation paths use the default.
Idempotent handoff receipts are read-only and therefore cannot advance revision.

Coverage creation is lazy. The server locks Booking, then Visit, rechecks the actor,
assignment, tenure and lifecycle, and creates/finds the unique thread. It uses READ
COMMITTED so a waiter sees the assignment that committed before it obtained the
lock. Sends use the same locks, preventing a handoff from committing between the
permission check and message insertion. Messaging creation is outside financial
handoff transactions. Only the database revision advancement accompanies handoff.

Historical Booking upserts use PostgreSQL's partial unique constraint directly;
Prisma cannot express this partial index as a `findUnique`/`upsert` selector.

## Lifecycle

For a confirmed Booking and Visit, the matching coverage sitter can read and send.
When either is completed/canceled, the matching sitter can read but cannot send.
There is no post-completion reply window. Operators retain read access and can send
in a current terminal tenure, consistent with the existing operator policy.
Historical superseded tenures are read-only for operators. Reassigned sitters are
denied read, send, polling, and inbox discovery for their previous tenure.

Coverage thread polling runs every 15 seconds while visible and on focus. A denied
poll immediately replaces the thread with an unavailable view, removes its message
history/composer, and stops polling. Server authorization revocation takes effect
when reassignment commits; an already displayed page learns this at its next poll.
No new data is delivered to a revoked participant during that interval.

## Read state and sender identity

Coverage sends always store the authenticated senderUserId and senderType; a DB
trigger also rejects missing identities or role mismatches. No coverage SYSTEM
messages are generated in V1. Historical message semantics are unchanged.

Each participant has a separate `(conversationId, participantKey)` cursor. Unread
counts query all authorized incoming messages after that cursor, with no 20/50
message truncation. Sitter incoming messages are OPERATOR; operator incoming
messages are SITTER. The sitter dock totals independently scoped Booking and
coverage counts, without sharing read state.

A read marker advances only through the newest message fetched for display. It
never moves backwards. Coverage message insertion locks the conversation and
assigns a database timestamp strictly later than all previous messages, including
same-millisecond and concurrent inserts. Consequently an unseen later message
cannot fall behind the delivered cursor. Historical BOOKING timestamps and its
legacy read/unread behavior remain unchanged by this phase.

## UI

Coverage Visit detail links to `Message operator`. The sitter inbox shows coverage
entries separately from historical Booking conversations. The operator Messages
navigation opens separate coverage and Booking sections. Coverage labels include
Visit date/time in its stored schedule timezone, sitter, assignment revision, and
current/historical status. Thread pages show names, roles, timestamps, a mobile
composer or read-only notice, and return navigation. They have no whole-booking
cancellation or reassignment controls.

## Verification commands

- `node scripts/run-participant-messaging-checks.mjs unit`
- `node scripts/participant-messaging-qa.mjs apply` (one-time, disposable QA only)
- `node scripts/participant-messaging-qa.mjs verify`
- `node scripts/run-participant-messaging-checks.mjs all-postgres`
- `node scripts/run-participant-messaging-checks.mjs remaining-regressions`
- `npx prisma validate`, `npx prisma generate`, targeted ESLint, `npm run build`
- `git diff --check`

QA commands load the same local configuration as Next.js, authenticate both database
URLs against the configured disposable branch, and suppress credential-bearing
CLI output. Migration verification compares old messages, read state, conversation
IDs/timestamps, Visit data and protected counts. Test fixtures use unique email-only
client identities to avoid matching a preserved synthetic client by phone.
Fixtures are removed transactionally and baseline equality is asserted.

## Operational limits

Apply the approved migration before running this version. New Prisma code requires
the new columns; this is not a deployment or a production migration. Production
remains untouched. The coverage inbox currently enumerates authorized threads and
performs bounded-context checks per entry; pagination/batched discovery can be added
if volume warrants it. Message content is stored as ordinary text, escaped by React.
