# Selected-Visit handoff and bounded participation

This phase implements an **internal-only** handoff transaction and participant DTO.
There is no operator action, API endpoint, or UI control that invokes the writer.
There is no schema change or migration. Public canonical booking remains disabled.

## Audit and checkpoint

Started on clean main at 3b45f101b76f560099de52ca8400dee7cf1a1d33, matching both
cached and live origin/main. The audit was completed before edits. Existing
Booking/Visit locks, immutable authorization revisions, unique predecessors,
per-Visit operation keys, and BookingHistory.note support the implementation.
No durable participation membership is needed: current Visit assignment is the
bounded permission source. Database queries validate sitter/operator roles.

Booking.sitterId remains the lead and original BookingSitterCompensation owner.
Visit.sitterId is scheduled execution authority. Visit.performedBySitterId is
performance evidence. Positions remain immutable. Handoff never writes lead,
performer, original commitment, pricing, attribution, reward, or allocation rows.

Whole-booking reassignment remains unavailable after commitment. Confirmation
continues to prepare initial terms atomically, and is not invoked by handoff.
REQUESTED handoff is unsupported: there is no current authorization to supersede.
Legacy and historical incomplete canonical records fail closed.

The audit found lead-only checks in sitter booking detail, messaging reads,
sends, polling, unread state, and cancellation approval. These stay lead-only.
Visit completion already authenticates the scheduled sitter through the server
action; the transaction rechecks Visit assignment and financial readiness.
Operator assignment UI accepts a whole Booking and cannot safely express a
selected-unit operation, so it remains unwired. Client UI remains unchanged.

## Transaction and retry contract

Input: bookingId, unique explicit visitIds, replacement sitterId, authenticated
operator actorId, operationId, optional reason. Extra money/rate/policy inputs
are not read. The operation key is scoped to a Booking and prefixed `handoff:`.
A normalized fingerprint binds actor, Booking, sorted selection, replacement,
key, and reason. A different payload under the same key fails closed.

One Serializable transaction validates operator role, locks Booking then all its
Visits ordered by id, and rereads state. All Visits are locked to match existing
completion/cancellation lock order, but only selected assignments are written.
If a reservation exists, its reward account is locked next and state reread.
No reward mutation occurs. Serialization/deadlock failures restart the entire
transaction, up to three attempts.

Eligible Booking: CONFIRMED, nonterminal, complete valid canonical financial
coverage. Every selected Visit must belong to it, have a valid persisted interval,
be CONFIRMED, be strictly in the future according to PostgreSQL clock_timestamp,
and have no completion timestamp, performer, allocation, or voided authorization.
The current authorization must match its current scheduled sitter. Selecting a
Visit already assigned to the replacement rejects the entire request.

Availability uses persisted timestamps, strict overlap and zero buffer, checking
both other bookings and unselected same-booking Visits assigned to the replacement.
Touching intervals are allowed. Cross-midnight intervals use actual timestamps.

For each selected Visit the service derives terms, appends predecessor-linked
revision N+1, and changes Visit.sitterId. One structured BookingHistory note records
operation/fingerprint, lead, selected positions/IDs, old sitters, new sitter,
actor (changedByUserId), and reason. No existing authorization is updated or voided:
the highest revision supersedes predecessors. Readiness validates the complete
chain, including historical identities and chronology. It never falls back to an
older revision. Final readiness and database-time checks run before return.
All writes roll back on any failure.

Replay returns the same immutable operation receipt (Visit, sitter, authorization
ID, revision), with no duplicate revision/history. If a later handoff superseded
that receipt, replay still reports the original operation result; it does not
claim those historical assignments are current or restore them. Obtain current
assignment through a fresh authorized reader.

## Economics and rewards

Validated configured owner replacement: OWNER_OPERATOR / OWNER_0_PERCENT,
full frozen client unit subtotal, 0 bps, no rate lookup and no reward references.
Ordinary replacement: BUSINESS_ASSIGNED, its own active sitter override or default
business rate, own applied pet rules, frozen unit client-base 90% ceiling, 1000 bps.
No current client rate is queried. Authorization stores rate ID/version and
applied pet-rule provenance. Unit fee rounds half-up.

Returning to the frozen original eligible referral sitter restores the
SITTER_ORIGINATED unit basis. 500 bps requires that sitter's existing valid
consumed booking commitment/reservation entitlement; otherwise 1000 bps. No new
reservation, reopening, transfer, consumption or reward progress mutation occurs.
A consumed entitlement remains historical even while replacement units use
10% ordinary or 0% owner fees. Existing qualification rejects split performer
sets; reward thresholds are unchanged.

## Bounded participant contract

participationKind returns LEAD, VISIT_PARTICIPANT, or NONE. The database resolver
requires an actual SITTER and queries only lead ownership or current noncanceled
Visit assignment. A removed replacement loses access immediately on the next read.
There is no broadening of the existing lead page payload.

For LEAD, participantCareDto returns only a useLeadView routing marker; the existing
lead path retains whole-booking permissions. For VISIT_PARTICIPANT it is an explicit allowlist: Booking ID/status; service label and
duration; client name/phone; pet names/details; access/location instructions;
service address/coordinates; and only that sitter's noncanceled Visit IDs,
times/status/completion timestamp and own expected/earned amount/currency.
General Booking.notes is excluded because it is not a dedicated participant care
field. There is no client email, client-link token, other Visit list, other sitter
money, raw authorization/allocation, reward identity, history, conversation,
operator note, or cancellation/reassignment permission in this DTO. Missing
readiness returns an unavailable shell without care/contact/location details.
The helper is an internal authenticated-server seam, not a browser action.

Existing dashboard queries remain lead-only until the participant UI is reviewed.
Lead route/card payloads preserve every Booking Visit through a safe operational
projection containing scheduled sitter ID/name, interval/status and an own-execution
flag. Raw financial relations are stripped; only the lead's own Visit money is
projected. Lead detail and the split-booking dashboard schedule show all Visits
and their assigned sitters. Personal action lists, route action selection and
earnings exclude replacement Visits. Server completion still independently
checks authenticated Visit assignment; client flags never authorize a write.
Operator detail displays each Visit's scheduled sitter. Original Booking payout
is explicitly labeled original commitment when revision history indicates handoff.
Participant expected/earned money uses only its own authorization/allocation.

No conversation membership is added. Existing message read/send/poll/unread and
whole-booking cancellation continue using Booking.sitterId. Participants cannot
cancel the whole Booking. Operator access is unchanged. Messaging is not required
by the internal contract: the DTO supplies the existing operational phone contact.
A future message channel needs a separately approved bounded history policy.

## Completion, review and cancellation

The existing authenticated sitter action checks scheduled assignment and freezes
the authenticated sitter as performer. Replacement completion copies the current
frozen authorization into one immutable allocation. An old sitter is rejected;
operator-preserved mismatch/null evidence creates financial review, not earnings.
Rates and current owner configuration are not consulted at completion.

Original commitment validation now validates that original identity independently
of current Visit assignments. Care readiness continues validating every revision
and current assignment. Split Booking completion additionally requires exact
allocation/authorization/performer coverage for each completed unit. Existing
single-sitter operational-review semantics remain intact. No settlement is added.

Pre-service whole-booking cancellation still requires lead/operator authority,
no started/performed care, and valid financial state. Valid split assignments may
be canceled and current unperformed authorizations voided. Consumed reward stays
consumed. Missed review uses the same Booking-first lock; it only acts on overdue
unresolved care, whereas handoff requires future care.

## Activation blockers

Before operational/public activation: build and review an operator selected-Visit
picker with stable operation keys and conflict feedback; wire a dedicated bounded
participant detail/list/route/own-earnings UI to the DTO; verify navigation and
contact instructions in browser; decide the source of participant-specific care
notes; and separately decide whether bounded messaging is needed. Keep generic
lead detail and historical conversations restricted. Do not activate the internal
writer through an ad-hoc endpoint or widen a lead query with an OR condition.

Production deployment/migrations, client repricing, settlement, Stripe transfers,
refunds, clawbacks and attribution rewrites are outside this phase. Public canonical
booking activation remains a separate approval.
