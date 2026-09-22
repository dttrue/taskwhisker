"use server";

import { requireAuth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { manualOptions, quoteManualBooking, createManualBooking } from "@/lib/schedule/manualBooking";

import { manualBookingFailure as failure } from "@/lib/schedule/manualBookingErrors";

export async function searchScheduleClients(query) {
  const session = await requireAuth();
  try { return { ok: true, ...(await manualOptions(prisma, session.user.id, query)) }; }
  catch (error) { return failure(error); }
}

export async function reviewManualBooking(input) {
  const session = await requireAuth();
  try { return { ok: true, ...(await quoteManualBooking({ db: prisma, actorId: session.user.id, input, secret: process.env.NEXTAUTH_SECRET })) }; }
  catch (error) { return failure(error, input); }
}

export async function saveManualBooking(input, token) {
  const session = await requireAuth();
  let result;
  try { result = await createManualBooking({ db: prisma, actorId: session.user.id, input, token, secret: process.env.NEXTAUTH_SECRET }); }
  catch (error) { return failure(error, input); }
  // A cache refresh failure must not turn a committed booking into a failed save.
  try {
    for (const path of ["/dashboard/schedule", "/dashboard/operator", "/dashboard/operator/operations", "/dashboard/sitter"]) revalidatePath(path);
  } catch { /* The dynamic schedule will read the committed visits on navigation. */ }
  return { ok: true, ...result };
}
