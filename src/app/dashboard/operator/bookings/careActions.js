'use server';
import { requireRole } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { approveCareInstructionsWithDb } from '@/lib/bookings/careSnapshot/remediation';

export async function approveCareInstructions(input) {
  const session = await requireRole(['OPERATOR']);
  const bookingId = input?.bookingId;
  const result = await approveCareInstructionsWithDb({ db: prisma, actorId: session.user.id,
    bookingId, careInstructions: input?.careInstructions, operationId: input?.operationId });
  if (result.ok) {
    revalidatePath(`/dashboard/operator/bookings/${bookingId}`);
    revalidatePath('/dashboard/operator');
    revalidatePath('/dashboard/sitter', 'layout');
  }
  return result;
}
