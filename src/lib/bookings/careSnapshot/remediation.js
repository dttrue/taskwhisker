import { createHash } from 'node:crypto';

export const careApprovalPrefix = 'CARE_INSTRUCTIONS_APPROVED';

// An opaque review/operation key, not a caller-selected snapshot version. History
// IDs detect A -> B -> A edits even when timestamps have the same precision.
export function careReviewKey(booking) {
  return createHash('sha256').update(JSON.stringify([
    booking.id, booking.careInstructionsVersion, booking.careInstructions,
    (booking.history || []).filter(h => h.note?.startsWith(careApprovalPrefix)).map(h => h.id).sort(),
  ])).digest('hex');
}

export function normalizeApprovedCare(value) {
  if (typeof value !== 'string') throw new Error('Care instructions must be text.');
  const text = value.trim();
  if (text.length > 1000) throw new Error('Care instructions must be at most 1000 characters.');
  return text || null;
}

const conflict = () => ({ ok: false, code: 'CARE_REVIEW_CONFLICT', error: 'Care instructions changed since you opened this review. Refresh and review the latest instructions.' });

export async function approveCareInstructionsWithDb({ db, actorId, bookingId, careInstructions, operationId }) {
  if (typeof actorId !== 'string' || !actorId) return { ok: false, error: 'Only an operator can approve care instructions.' };
  if (typeof bookingId !== 'string' || !bookingId || bookingId.length > 200 ||
      typeof operationId !== 'string' || !/^[a-f0-9]{64}$/.test(operationId)) {
    return { ok: false, error: 'Refresh the booking before reviewing care instructions.' };
  }
  let approved;
  try { approved = normalizeApprovedCare(careInstructions); }
  catch (error) { return { ok: false, error: error.message }; }
  try {
    return await db.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
      if (actor?.role !== 'OPERATOR') return { ok: false, error: 'Only an operator can approve care instructions.' };
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: {
        id: true, careInstructions: true, careInstructionsVersion: true,
        history: { where: { note: { startsWith: careApprovalPrefix } }, select: { id: true, note: true } },
      } });
      if (!booking) return { ok: false, error: 'Booking not found.' };
      if (booking.careInstructionsVersion !== null && booking.careInstructionsVersion !== 1) {
        return { ok: false, error: 'This care instruction format needs review before it can be edited.' };
      }
      // Safe reconciliation: the persisted snapshot already equals this intent.
      if (booking.careInstructionsVersion === 1 && booking.careInstructions === approved) return { ok: true, replay: true };
      if (careReviewKey(booking) !== operationId) return conflict();
      await tx.booking.update({ where: { id: bookingId }, data: { careInstructions: approved, careInstructionsVersion: 1 } });
      await tx.bookingHistory.create({ data: {
        bookingId, changedByUserId: actorId,
        note: `${careApprovalPrefix} · ${booking.careInstructionsVersion === null ? 'manual legacy review' : 'manual approved-care edit'} · ${approved === null ? 'empty' : 'non-empty'}`,
      } });
      return { ok: true, replay: false };
    }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 15000 });
  } catch (error) {
    if (error.code === 'P2034') return conflict();
    return { ok: false, error: 'Care instructions could not be saved. Try again.' };
  }
}
