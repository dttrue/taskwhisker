// Server-internal database seam. Callers obtain actorId only from authentication.
const terminal = status => ['COMPLETED', 'CANCELED'].includes(status);
const denied = () => { const error = new Error('Visit messages are unavailable.'); error.code = 'COVERAGE_DENIED'; throw error; };
export const visitContextSelect = {
  id: true, bookingId: true, sitterId: true, assignmentRevision: true,
  status: true, startTime: true, endTime: true,
  sitter: { select: { name: true } },
  booking: { select: { id: true, sitterId: true, status: true, scheduleTimeZone: true, petNames: true, client: { select: { name: true } } } },
};
export function coverageAccess(actor, visit, thread) {
  if (!actor || !visit || !['SITTER', 'OPERATOR'].includes(actor.role)) return null;
  if (!['CONFIRMED', 'COMPLETED', 'CANCELED'].includes(visit.status) || !['CONFIRMED', 'COMPLETED', 'CANCELED'].includes(visit.booking.status)) return null;
  if (thread && (thread.scope !== 'COVERAGE_VISIT' || thread.visitId !== visit.id || thread.bookingId !== visit.bookingId)) return null;
  const current = !thread || (thread.coverageSitterId === visit.sitterId && thread.assignmentRevision === visit.assignmentRevision);
  if (actor.role === 'SITTER' && (!current || visit.sitterId !== actor.id || visit.booking.sitterId === actor.id)) return null;
  if (!thread && (!visit.sitterId || visit.sitterId === visit.booking.sitterId)) return null;
  return { current, canSend: current && (actor.role === 'OPERATOR' || (!terminal(visit.status) && !terminal(visit.booking.status))) };
}
export function coverageLabel(visit) {
  return `Coverage — ${visit.booking.petNames?.join(', ') || visit.booking.client?.name || 'Visit'}`;
}
export async function markDelivered(tx, conversationId, actor, boundary) {
  if (!boundary) return;
  const participantKey = `${actor.role.toLowerCase()}:${actor.id}`;
  await tx.conversationParticipant.upsert({
    where: { conversationId_participantKey: { conversationId, participantKey } },
    create: { conversationId, participantKey, userId: actor.id, participantType: actor.role, lastReadAt: boundary }, update: {},
  });
  await tx.conversationParticipant.updateMany({
    where: { conversationId, participantKey, OR: [{ lastReadAt: null }, { lastReadAt: { lt: boundary } }] },
    data: { lastReadAt: boundary },
  });
}
export async function coverageThreadWithDb({ db, actorId, visitId, threadId, body, markRead = false, summary = false, create = true }) {
  if (!actorId || (!visitId && !threadId)) denied();
  if (body !== undefined && (typeof body !== 'string' || !body.trim() || body.trim().length > 2000)) {
    const error = new Error('Enter a message of 1–2,000 characters.'); error.code = 'INVALID_MESSAGE'; throw error;
  }
  // READ COMMITTED after row locking sees a handoff which committed while waiting.
  return db.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor || !['SITTER', 'OPERATOR'].includes(actor.role)) denied();
    let thread = threadId ? await tx.conversation.findUnique({ where: { id: threadId } }) : null;
    if (threadId && (!thread || thread.scope !== 'COVERAGE_VISIT' || (visitId && visitId !== thread.visitId))) denied();
    const identity = await tx.visit.findUnique({ where: { id: thread?.visitId || visitId }, select: { bookingId: true } });
    if (!identity) denied();
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${identity.bookingId} FOR UPDATE`;
    const selectedVisitId = thread?.visitId || visitId;
    await tx.$queryRaw`SELECT id FROM "Visit" WHERE id = ${selectedVisitId} FOR UPDATE`;
    const visit = await tx.visit.findUnique({ where: { id: selectedVisitId }, select: visitContextSelect });
    let access = coverageAccess(actor, visit, thread);
    if (!access) denied();
    if (!thread) {
      thread = await tx.conversation.findUnique({ where: { visitId_assignmentRevision: { visitId: visit.id, assignmentRevision: visit.assignmentRevision } } });
      if (!thread && create) {
        const sitter = await tx.user.findUnique({ where: { id: visit.sitterId }, select: { role: true } });
        if (sitter?.role !== 'SITTER') denied();
        thread = await tx.conversation.create({ data: { scope: 'COVERAGE_VISIT', bookingId: visit.bookingId, visitId: visit.id, coverageSitterId: visit.sitterId, assignmentRevision: visit.assignmentRevision } });
      }
      access = coverageAccess(actor, visit, thread);
      if (!access) denied();
    }
    if (body !== undefined) {
      if (!thread) denied();
      if (!access.canSend) throw Object.assign(new Error("This conversation is read-only."), { code: "COVERAGE_READ_ONLY" });
      // This row lock also serializes with the timestamp trigger and read cursors.
      await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${thread.id} FOR UPDATE`;
      await tx.message.create({ data: { conversationId: thread.id, senderUserId: actor.id, senderType: actor.role, body: body.trim() } });
      await tx.conversation.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    }
    const participantKey = `${actor.role.toLowerCase()}:${actor.id}`;
    const participant = thread ? await tx.conversationParticipant.findUnique({ where: { conversationId_participantKey: { conversationId: thread.id, participantKey } } }) : null;
    const unreadCount = thread ? await tx.message.count({ where: { conversationId: thread.id, senderType: actor.role === 'SITTER' ? 'OPERATOR' : 'SITTER', ...(participant?.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}) } }) : 0;
    const messages = thread && !summary ? await tx.message.findMany({ where: { conversationId: thread.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, body: true, createdAt: true, senderType: true, senderUser: { select: { name: true } } } }) : [];
    // Every coverage insertion receives a strictly increasing DB timestamp; this
    // delivered boundary cannot swallow a concurrent message, even in the same ms.
    if (markRead && messages.length) await markDelivered(tx, thread.id, actor, messages.at(-1).createdAt);
    const last = thread ? await tx.message.findFirst({ where: { conversationId: thread.id }, orderBy: { createdAt: 'desc' }, select: { id: true } }) : null;
    const count = thread ? await tx.message.count({ where: { conversationId: thread.id } }) : 0;
    return { id: thread?.id ?? null, visitId: visit.id, bookingId: visit.bookingId, label: coverageLabel(visit), startTime: visit.startTime, endTime: visit.endTime, timeZone: visit.booking.scheduleTimeZone || "America/New_York",
      sitterName: thread && !access.current ? (await tx.user.findUnique({ where: { id: thread.coverageSitterId }, select: { name: true } }))?.name : visit.sitter?.name,
      revision: thread?.assignmentRevision ?? visit.assignmentRevision, current: access.current, canSend: access.canSend,
      terminal: terminal(visit.status) || terminal(visit.booking.status), messages, unreadCount,
      fingerprint: `${thread?.id ?? '-'}:${last?.id ?? '-'}:${count}:${visit.status}:${visit.booking.status}:${access.current}:${access.canSend}` };
  }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 30000 });
}
export async function coverageInboxWithDb({ db, actorId }) {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
  if (!actor || !['SITTER', 'OPERATOR'].includes(actor.role)) denied();
  const threads = await db.conversation.findMany({ where: { scope: 'COVERAGE_VISIT', ...(actor.role === 'SITTER' ? { coverageSitterId: actor.id, visit: { sitterId: actor.id } } : {}) }, select: { id: true, visitId: true, assignmentRevision: true }, orderBy: { updatedAt: 'desc' } });
  const visits = await db.visit.findMany({ where: { status: { in: ['CONFIRMED', 'COMPLETED', 'CANCELED'] }, ...(actor.role === 'SITTER' ? { sitterId: actor.id } : { sitterId: { not: null } }) }, select: { id: true, sitterId: true, assignmentRevision: true, booking: { select: { sitterId: true } } }, orderBy: { startTime: 'asc' } });
  const candidates = [...threads.map(t => ({ threadId: t.id })), ...visits.filter(v => v.sitterId !== v.booking.sitterId && !threads.some(t => t.visitId === v.id && t.assignmentRevision === v.assignmentRevision)).map(v => ({ visitId: v.id }))];
  const result = [];
  for (const candidate of candidates) {
    try { result.push(await coverageThreadWithDb({ db, actorId, ...candidate, summary: true, create: false })); }
    catch (error) { if (error.code !== 'COVERAGE_DENIED') throw error; }
  }
  return result;
}
