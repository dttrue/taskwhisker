import { normalizeHandoff, validateHandoff } from "./contract.js";
import { replacementAuthorization } from "./economics.js";
import { economicsInclude } from "../economics/bookingEconomics.js";
import { authorizationInclude, visitFinancialInclude, reject } from "../visitCompensation/contract.js";
import { careReadiness } from "../visitCompensation/readiness.js";
import { financialDatabaseTime } from "../visitCompensation/writes.js";
import { assertSitterAvailable } from "../confirmation/confirmationContract.js";
import { isRetryableRewardTransactionError } from "../../rewards/rewardProgressGrantWrites.js";

export const handoffInclude = { ...economicsInclude, rewardReservation: { include: { grant: true } }, bookingPets: { orderBy: { position: "asc" } }, visits: { orderBy: { id: "asc" }, include: visitFinancialInclude } };
const receipt = rows => rows.map(a => ({ visitId: a.visitId, sitterId: a.sitterId, authorizationId: a.id, revision: a.revision })).sort((a,b) => a.visitId.localeCompare(b.visitId));
// Internal only: intentionally no server action or operator UI imports this writer.
export async function handoffSelectedVisitsWithDb({ db, ...args }) {
  let input;
  try { input = normalizeHandoff(args); } catch (e) { return { ok: false, code: e.code }; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
        if (actor?.role !== "OPERATOR") reject("NOT_AUTHORIZED");
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`;
        // Lock every Visit in the existing lifecycle order; untouched units are read-only.
        await tx.$queryRaw`SELECT id FROM "Visit" WHERE "bookingId" = ${input.bookingId} ORDER BY id FOR UPDATE`;
        let booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: handoffInclude });
        if (!booking) reject("BOOKING_NOT_FOUND");
        const existing = await tx.visitSitterCompensationAuthorization.findMany({ where: { bookingId: input.bookingId, operationId: input.operationId }, include: authorizationInclude });
        if (existing.length) {
          if (existing.length !== input.visitIds.length || existing.some(a => !input.visitIds.includes(a.visitId) || a.sitterId !== input.sitterId || a.actorUserId !== input.actorId || a.reason !== `SELECTED_VISIT_HANDOFF:${input.fingerprint}`)) reject("HANDOFF_OPERATION_CONFLICT");
          // An immutable operation receipt, even if later work superseded it; no writes.
          return { ok: true, code: "HANDOFF_REPLAY", assignments: receipt(existing) };
        }
        if (booking.rewardReservation) {
          const sitterId = booking.rewardReservation.sitterId;
          await tx.$queryRaw`SELECT id FROM "SitterRewardAccount" WHERE "sitterId" = ${sitterId} FOR UPDATE`;
          if (!await tx.sitterRewardAccount.findUnique({ where: { sitterId } })) reject("REWARD_STATE_CONFLICT");
          booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: handoffInclude });
        }
        const selected = validateHandoff(booking, input, await financialDatabaseTime(tx));
        const sitter = await tx.user.findUnique({ where: { id: input.sitterId }, select: { role: true } });
        if (sitter?.role !== "SITTER") reject("INVALID_SITTER");
        await assertSitterAvailable(tx, booking.id, input.sitterId, selected);
        const rows = [];
        for (const visit of selected) {
          const data = await replacementAuthorization(tx, booking, visit, input, await financialDatabaseTime(tx));
          // Recheck time after rate reads as well as immediately before transaction return.
          validateHandoff(booking, input, await financialDatabaseTime(tx));
          rows.push(await tx.visitSitterCompensationAuthorization.create({ data, include: authorizationInclude }));
          await tx.visit.update({ where: { id: visit.id }, data: { sitterId: input.sitterId } });
        }
        await tx.bookingHistory.create({ data: { bookingId: booking.id, changedByUserId: input.actorId, toSitterId: input.sitterId,
          note: JSON.stringify({ type: "SELECTED_VISIT_HANDOFF", operationId: input.operationId, fingerprint: input.fingerprint,
            leadSitterId: booking.sitterId, visits: selected.map(v => ({ id: v.id, position: v.canonicalUnitPosition, fromSitterId: v.sitterId })), toSitterId: input.sitterId, reason: input.reason }) } });
        const after = await tx.booking.findUnique({ where: { id: booking.id }, include: handoffInclude });
        if (!careReadiness(after).ok) reject("FINANCIAL_READINESS_MISSING");
        validateHandoff(booking, input, await financialDatabaseTime(tx));
        return { ok: true, code: "VISITS_HANDED_OFF", assignments: receipt(rows) };
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (isRetryableRewardTransactionError(error) && attempt < 2) continue;
      return { ok: false, code: error.code || "HANDOFF_PERSISTENCE_ERROR", error: "Selected visits could not be handed off. Operator review is required." };
    }
  }
}
