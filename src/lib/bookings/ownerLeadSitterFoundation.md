# Owner identity and lead-sitter foundation

This foundation does not enable split work, owner compensation math, Visit
authorization/allocation, or public canonical booking. No schema change is needed.

## Trusted owner identity

Configure both `BUSINESS_OWNER_OPERATOR_USER_ID` and
`BUSINESS_OWNER_SITTER_USER_ID` in the server environment with the verified pair
of existing accounts. Values are not committed. The accounts remain separate:
the operator is the administrative actor; the sitter is the scheduled/performed
identity. Configuration is an explicit administrative assertion of that linkage;
role validation alone cannot establish that two accounts represent one person.

`businessOwnerIdentity.js` is server-only. `resolveBusinessOwnerIdentity()` accepts
no caller configuration. It loads exact IDs, selecting only ID and role, requires
OPERATOR and SITTER respectively, and rejects identical IDs. The sitter predicate
always validates the pair before comparing identity. No name, email, default
sitter, Booking operator, role-only, or browser-input inference is used. There is
no cache or fallback. The internal WithDb contract accepts configuration solely
for trusted dependency injection/tests. Do not expose it as a server action.

Errors: `OWNER_CONFIGURATION_MISSING`, `OWNER_OPERATOR_INVALID`,
`OWNER_SITTER_INVALID`, `OWNER_CONFIGURATION_INCONSISTENT`. Messages omit IDs.
Self-assignment by another operator returns `OWNER_OPERATOR_REQUIRED`.

The operator "assign to me" action now uses this pair instead of the old
hardcoded email mapping. Explicit assignment to a selected sitter retains the
existing OPERATOR authorization, availability and compensation/care guards.
The default public sitter setting remains independent and unchanged.

## Owner exclusion from ordinary rewards

Fresh progress and reservation decisions validate owner identity inside their
existing Serializable transaction, after structural eligibility but before any
reward write. The configured owner returns `OWNER_REWARD_EXCLUDED`, with
NOT_QUALIFIED / NOT_ELIGIBLE respectively. No progress, grant, reservation, or
account is created or changed. Other sitters retain existing reward rules.

Missing/invalid owner configuration fails closed for otherwise eligible NEW
reward decisions, including ordinary sitters: without a valid pair the runtime
cannot prove non-owner identity. Provision configuration before using these
entry points. Existing adjudications and reservations still replay their stored
disposition before current eligibility checks; consumed/released transitions and
immutable compensation are unchanged. This is no retroactive reward repair.
Existing owner-linked entitlements require an explicit later policy workflow;
they are neither silently released nor erased by this foundation.

`evaluateRewardQualification` remains a pure structural evidence evaluator, not
a permission to write rewards. Only the transaction writer applies the trusted
owner exclusion. Split/missing performers still fail structural qualification.
Production wrappers allowlist bookingId, so caller-provided owner flags,
configuration, roles and databases cannot bypass exclusion. No owner fee math
or compensation-engine change is included.

## Identity meanings and current boundary

- Booking.sitterId: lead / primary operational sitter.
- Visit.sitterId: scheduled sitter for that Visit.
- Visit.performedBySitterId: actual performer, immutable once recorded.

Current reachable canonical flows remain single-sitter. Confirmation still
requires all assignments to agree. Whole-booking reassignment remains blocked
after compensation or care. The shared effective-lane and completion guards
are deliberately retained. Calling the Booking field "lead" is not permission
to remove those guards or to infer a performer from it.

## Consumer inventory and classification

Audit covers direct Booking.sitterId reads/writes, nested booking filters,
Booking.sitter relation projections, and downstream DTO consumers. Paths below
are relative to src. Categories: **1** lead context correct; **2** scheduled Visit
identity; **3** actual performer; **4** bounded participation access required;
**5** blocked until Visit financial authorization/allocation exists. Some surfaces
have multiple responsibilities, hence multiple categories.

| Consumer(s) | Class | Current disposition / prerequisite |
| --- | --- | --- |
| app/dashboard/operator/bookings/actions.js; _components/AssignSitterForm.jsx | 1,5 | Owner self-assignment mapping migrated; whole-booking guards unchanged. Future handoff needs a separate selected-Visit transaction. |
| lib/bookings/confirmation/confirmationService.js, confirmationContract.js, reassignmentContract.js | 1,2,5 | Initial confirmation requires one lead and consistent unperformed assignments. No partial reassignment introduced. |
| lib/bookings/compensation/commitBookingSitterCompensation.js, compensationContract.js | 5 | Original commitment remains immutable; existing sitter/rate/Visit identity checks must not be weakened. |
| lib/bookings/compensation/effectiveCompensationLane.js | 5 | Precommit single-assignee resolver and frozen snapshot validator; not a future per-Visit policy resolver. |
| lib/bookings/economics/bookingEconomics.js, completionService.js; app/actions/completeBooking.js; sitter/actions.js | 2,3,5 | Execution uses Visit assignment; sitter completion records actor as performer. Operator completion leaves performer absent. Booking completion still requires existing financial consistency. |
| lib/visits/visitPerformerAttribution.js | 2,3 | Correct scheduled authorization and immutable performer evidence; never substitute lead. |
| lib/bookings/cancellation/canonicalCancellation.js; cancelBookingTransaction.js; sitter/messages/[bookingId]/approveCancellationActions.js | 1,4,5 | Preserve lead cancellation permission and canonical financial review. A future participant gets no whole-booking cancellation authority. |
| lib/rewards/rewardQualification.js, rewardProgressGrantWrites.js, rewardReservationWrites.js | 1,3,5 | Qualification uses every actual performer and historical origin. Reservation currently checks lead consistency. Owner excluded from new ordinary rewards; future unit entitlement needs allocation policy. |
| lib/attribution/clientAttributionContract.js; lib/referrals/sitterReferralCodeWrites.js | 1 | Historical referring/requested identity is not current performance. Keep origin/referral history and existing role checks. Owner exclusion does not delete attribution/referral codes. |
| lib/pricing/calculateBusinessAssignedSitterCompensation.js, quoteBusinessAssignedSitterCompensation.js, calculateSitterOriginatedCompensation.js, sitterOriginatedCompensationResolver.js | 5 | Explicit quote/commitment sitter and lane, not lead-derived actual earnings. No owner math or new policy here. |
| lib/bookings/canonical/createCanonicalBooking.js; resolveDefaultPublicBookingSitter.js; app/book/actions.js | 1,2 | Initial lead and Visit assignments agree. Default sitter is not owner identity. Public canonical creation stays inactive. |
| app/book/[serviceCode]/page.jsx, PublicBookingWizard.jsx; canonical-preview/page.jsx, CanonicalBookingPreviewWizard.jsx; book/ steps/BookingStepSchedule.jsx; validatePublicBookingStep.js | 2 | Prospective schedule availability for selected/default sitter. No earned/owner authority. No handoff action. |
| app/api/availability/slots/route.js; lib/calendar/checkAvailability.js, getAvailableTimesForDate.js; app/dev/check-availability/page.js | 2 | Persisted Visit sitter/intervals drive conflicts. Confirmation zero-buffer overlap logic unchanged. |
| app/dashboard/sitter/page.jsx | 1,2,3,4,5 | Booking list is lead-only. Upcoming Visits already query Visit sitter. Completed counts currently query scheduled sitter; future performance metrics must use actual performer, and earnings must use allocations. |
| app/dashboard/sitter/lib/sitterDashboardUtils.js; _components/SitterDashboardLive.jsx, BookingCard.jsx, BookingTable.jsx | 1,2,3,4,5 | Lead DTOs and derived visit lists cannot be reused unrestricted for participants. Legacy estimates preserved; canonical per-Visit payout stays unavailable. |
| app/dashboard/sitter/_components/SitterRoutePanel.jsx, RouteNavigator.jsx | 2,4,5 | Routes need only the participant's assigned Visit DTOs; booking-wide payout/context must not leak. No change before handoff. |
| app/dashboard/sitter/bookings/[id]/page.jsx | 1,4,5 | Exact lead check retains current whole-booking access. Do not replace it with a broad any-Visit OR predicate. |
| app/dashboard/sitter/messages/page.jsx, messages/[bookingId]/page.jsx, messages/actions.js | 1,4 | Lead-only conversation context/send access retained; no automatic participant enrollment. |
| lib/messaging/getSitterConversations.js, getUnreadMessageCountForSitter.js; app/api/messages/poll/route.js, api/sitter/unread-messages/route.js | 1,4 | Inbox/thread/poll/unread paths consistently remain lead-scoped. Historical conversation participation is not inferred from assignment. |
| lib/messaging/getBookingConversation.js; app/dashboard/messages/[bookingId]/page.jsx | 1,4 | Generic operator page and send action now require OPERATOR before reads/writes, closing their previous sign-in-only/unguarded bypass. Query helpers are not an independent authorization boundary. Participant DTO must be distinct. |
| app/client/bookings/[clientLinkToken]/page.jsx, messages/page.jsx | 1,2 | Current sitter summary means lead; eventual per-Visit schedule needs explicit assignee display. Client-token access unchanged. |
| lib/email/sendSitterBookingNotificationEmail.js, sendClientBookingConfirmationEmail.js; app/book/actions.js notification calls | 1,2,4 | Existing creation notifications concern initial lead. Future replacement notice must be separately bounded to selected Visits, not a forwarded whole-booking notification. |
| app/dashboard/operator/bookings/[id]/page.jsx | 1,2,3,5 | Booking header is lead. Visit rows currently reuse Booking sitter labels; before split activation use scheduled sitter and separate actual performer labels. Financial section remains original commitment. |
| app/dashboard/operator/_components/BookingsTable.jsx; triage/page.jsx; page.jsx; lib/dashboardUtils.js, dashboardData.js; lib/getBookingNextAction.js | 1,5 | Lead/missing-lead status and client charge totals remain valid. Booking sitter payout is commitment, not per-performer earned amount. |
| app/dashboard/operator/operations/page.jsx; operations/_components/DailyVisitCard.jsx, OperatorSitterRoute.jsx, OperatorSitterRouteMap.jsx, OperatorSitterRouteMapInner.jsx | 2,3,5 | Operational grouping already uses Visit sitter; completed-work reporting must distinguish performer. Canonical per-Visit payout remains guarded. |
| lib/operations/interventionQueue.js, loadOperatorInterventions.js | 1,2,3 | Booking-level interventions identify lead; Visit interventions identify scheduled sitter. Do not attribute completed work to the lead. |
| app/dashboard/operator/lib/getRiskySitterSummary.js; booking-list/RiskySitterSummary.jsx | 2,3 | Current whole-booking grouping is safe only while single-sitter. Future missed/late work needs Visit scheduled identity; completed work needs performer evidence. |

No other payout settlement/reporting engine or participation-specific access layer
was found. Existing aggregate helpers count committed Booking economics, not
earned per-sitter allocations. New financial readers must not sum both.

## Access and messaging activation contract

The current lead-only authorization can safely remain in place for this
foundation because no split handoff is reachable. No participating-sitter rights
are granted or claimed to be implemented here. No durable membership relation is
required just to preserve that restriction.

Before activation, a separate Visit-scoped server endpoint/DTO should require
authenticated SITTER identity matching Visit.sitterId, and provide only that
Visit's interval, care option, frozen pet/care instructions, required location and
access instructions, necessary contact/escalation information, and that sitter's
own approved terms. Completion continues requiring assigned identity and freezes
actual performer. Lead status alone must not authorize another sitter's execution.
Past earnings access should use immutable allocation/performer identity, not
today's assignment. Exact retention/contact visibility needs review at activation.

Do not broaden the existing booking detail or conversation query with
`OR: visits.some(sitterId)`; those responses include whole-booking financial,
history and conversation data. Replacement access must exclude others' earnings,
unrelated Visits, operator controls and whole-booking cancellation. Assignment
can prove current Visit access without a new ACL model; historical conversation
access would need a separate reviewed bounded participation contract if requested.

Messaging decision for this foundation: **no participating-sitter messaging until handoff activation**. The existing generic operator page/send action now enforce OPERATOR explicitly; sitter-specific lead permissions are unchanged.
No historical conversation access, automatic participant addition, or messages
are created. If future coverage requires messaging, settle its bounded scope
before enabling that route; do not assume existing conversation membership is safe.

## Remaining prerequisites

1. Provision/validate the explicit owner pair outside source control.
2. Implement frozen pre-service Visit authorizations and immutable actual earnings,
   owner/ordinary policies, stable unit positions, cent reconciliation and durable
   missing-performer review without changing original snapshots.
3. Add bounded participating-sitter execution/read DTOs, own-earnings readers,
   safe notifications and any explicitly approved messaging participation.
4. Migrate the class 2/3/4/5 consumers above before activating handoff. Preserve
   legacy behavior and existing financial gates until their successors are proven.
5. Add the separate future-Visit handoff transaction and real PostgreSQL races
   against completion, cancellation and authorization replacement. Do not enable
   it merely because this identity foundation exists.

Configuration/helper tests need no database mutations. Existing opt-in PostgreSQL
regression suites now inject isolated owner fixture identities through the internal
seam; production wrappers cannot accept those overrides. No owner identity values
or QA branch identities are recorded here.
