'use server';
import { requireRole } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { submitOperatorHandoff, previewOperatorHandoff } from '@/lib/bookings/handoff/operatorSurface';
export async function submitVisitHandoff(input) {
  const session = await requireRole(['OPERATOR']);
  const result = await submitOperatorHandoff({ db: prisma, actorId: session.user.id, input });
  if (result.ok) {
    revalidatePath(`/dashboard/operator/bookings/${input.bookingId}`);
    revalidatePath('/dashboard/sitter', 'layout');
    revalidatePath('/dashboard/operator');
  }
  return result;
}
export async function previewVisitHandoff(input) {
  const session = await requireRole(['OPERATOR']);
  return previewOperatorHandoff({ db: prisma, actorId: session.user.id, input });
}
