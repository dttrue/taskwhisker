import { participantCareReady } from '../careSnapshot/contract.js';
import { validateHandoff } from './contract.js';
import { handoffSelectedVisitsWithDb, handoffInclude } from './handoffService.js';
import { assertSitterAvailable } from '../confirmation/confirmationContract.js';

const messages = {
  CARE_INSTRUCTIONS_REQUIRED: 'Care instructions need review before visits can be handed off.',
  HANDOFF_REQUIRES_CONFIRMED_BOOKING: 'Handoff requires an active confirmed booking.',
  FINANCIAL_READINESS_MISSING: 'Compensation or reward information needs operator review.',
  VISIT_NOT_HANDOFF_ELIGIBLE: 'A selected visit is no longer eligible. Refresh and review the selection.',
  HANDOFF_AFTER_START_REQUIRES_REVIEW: 'A selected visit has already started. Refresh and select future visits.',
  HANDOFF_ALREADY_ASSIGNED: 'This sitter is already assigned to a selected visit.',
  SITTER_UNAVAILABLE: 'This sitter has an overlapping visit. Choose another sitter or change the selection.',
  INVALID_SITTER: 'Choose a sitter from the roster.',
  INVALID_HANDOFF_INPUT: 'Select visits and a replacement sitter, then try again.',
  HANDOFF_OPERATION_CONFLICT: 'This attempt conflicts with an earlier request. Refresh before starting a new handoff.',
  NOT_AUTHORIZED: 'Only an operator can hand off visits.',
  P2034: 'Another update conflicted with this handoff. Retry the same request.',
  REWARD_STATE_CONFLICT: 'Reward information needs operator review before handoff.',
};
export function handoffMessage(code) {
  return messages[code] || 'The handoff could not be completed. Retry, or ask an operator to review compensation and availability.';
}
export function coverageRows(booking, now = new Date()) {
  return booking.visits.map(visit => {
    let reason = null;
    try {
      if (!participantCareReady(booking)) throw { code: 'CARE_INSTRUCTIONS_REQUIRED' };
      // The existing server contract supplies eligibility; the browser only renders it.
      validateHandoff(booking, { visitIds: [visit.id], sitterId: null }, now);
    } catch (error) {
      reason = !participantCareReady(booking) ? handoffMessage('CARE_INSTRUCTIONS_REQUIRED') :
        visit.status === 'COMPLETED' ? 'Completed' : visit.status === 'CANCELED' ? 'Canceled' :
        visit.performedBySitterId ? 'Already performed' : visit.compensationAllocation ? 'Compensation already allocated' :
        visit.startTime <= now ? 'Already started' : handoffMessage(error.code);
    }
    return { id: visit.id, startTime: visit.startTime.toISOString(), endTime: visit.endTime.toISOString(),
      status: visit.status, sitterId: visit.sitterId, scheduledSitterName: visit.sitter?.name || visit.sitter?.email || 'Unassigned',
      performedByName: visit.performedBySitter?.name || null, eligible: !reason, reason };
  });
}
export async function submitOperatorHandoff({ db, actorId, input }) {
  // Deliberate input allowlist. No caller-supplied actor, policy or money.
  const result = await handoffSelectedVisitsWithDb({ db, actorId, requireCareSnapshot: true,
    bookingId: input?.bookingId, visitIds: input?.visitIds, sitterId: input?.sitterId,
    operationId: input?.operationId, reason: input?.reason ?? '' });
  return result.ok ? { ok: true, replay: result.code === 'HANDOFF_REPLAY', count: result.assignments.length } :
    { ok: false, error: handoffMessage(result.code) };
}
export async function previewOperatorHandoff({ db, actorId, input }) {
  try {
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== 'OPERATOR') return { ok: false, error: handoffMessage('NOT_AUTHORIZED') };
    const booking = await db.booking.findUnique({ where: { id: input.bookingId }, include: handoffInclude });
    if (!participantCareReady(booking)) return { ok: false, error: handoffMessage('CARE_INSTRUCTIONS_REQUIRED') };
    if (!Array.isArray(input.visitIds) || !input.visitIds.length || input.visitIds.length > 366 || input.visitIds.some(id => typeof id !== "string" || !id) || new Set(input.visitIds).size !== input.visitIds.length) return { ok: false, error: handoffMessage('INVALID_HANDOFF_INPUT') };
    const sitter = await db.user.findUnique({ where: { id: input.sitterId }, select: { role: true } });
    if (sitter?.role !== 'SITTER') return { ok: false, error: handoffMessage('INVALID_SITTER') };
    const visits = validateHandoff(booking, input, new Date());
    await assertSitterAvailable(db, booking.id, input.sitterId, visits);
    return { ok: true, message: 'No schedule conflicts found. Availability is checked again when you submit.' };
  } catch (error) { return { ok: false, error: handoffMessage(error.code) }; }
}
