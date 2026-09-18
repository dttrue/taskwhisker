import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { coverageThreadWithDb, coverageInboxWithDb } from '@/lib/messaging/coverage';
export const dynamic = 'force-dynamic';
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) return reply({ error: 'Unauthorized' }, 401);
  const params = new URL(request.url).searchParams;
  try {
    if (params.get('scope') === 'inbox') {
      const rows = await coverageInboxWithDb({ db: prisma, actorId: session.user.id });
      return reply({ fingerprint: rows.map(t => `${t.visitId}:${t.fingerprint}:${t.unreadCount}`).sort().join('|') });
    }
    const thread = await coverageThreadWithDb({ db: prisma, actorId: session.user.id, threadId: params.get('threadId'), summary: true, create: false });
    return reply({ fingerprint: thread.fingerprint });
  } catch (error) {
    if (error.code === 'COVERAGE_DENIED') return reply({ error: 'Forbidden' }, 403);
    return reply({ error: 'Messaging temporarily unavailable' }, 503);
  }
}
