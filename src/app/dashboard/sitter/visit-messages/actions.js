'use server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { coverageThreadWithDb } from '@/lib/messaging/coverage';
import { revalidatePath } from 'next/cache';

export async function sendCoverageMessage({ threadId, body }) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, revoked: true, error: 'Sign in to view visit messages.' };
  try {
    await coverageThreadWithDb({ db: prisma, actorId: session.user.id, threadId, body });
    revalidatePath('/dashboard/sitter/messages');
    revalidatePath(`/dashboard/sitter/visit-messages/${threadId}`);
    revalidatePath('/dashboard/operator/messages');
    revalidatePath(`/dashboard/operator/messages/${threadId}`);
    return { ok: true };
  } catch (error) {
    if (error.code === 'COVERAGE_READ_ONLY') return { ok: false, readOnly: true, error: 'This conversation is now read-only.' };
    if (error.code === 'COVERAGE_DENIED') return { ok: false, revoked: true, error: 'Visit messages are no longer available.' };
    return { ok: false, error: error.code === 'INVALID_MESSAGE' ? error.message : 'Message could not be sent. Please retry.' };
  }
}
