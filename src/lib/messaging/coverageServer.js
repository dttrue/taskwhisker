import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { coverageThreadWithDb } from './coverage.js';
import { notFound, redirect } from 'next/navigation';

export async function coveragePageThread({ role, threadId, visitId }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const actor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (actor?.role !== role) notFound();
  try { return await coverageThreadWithDb({ db: prisma, actorId: session.user.id, threadId, visitId, markRead: Boolean(threadId) }); }
  catch (error) { if (error.code === 'COVERAGE_DENIED') notFound(); throw error; }
}
