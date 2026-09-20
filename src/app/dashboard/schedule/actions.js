"use server";

import { requireAuth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { manualOptions, quoteManualBooking, createManualBooking } from "@/lib/schedule/manualBooking";

function failure(error) {
  const safe = ["NOT_AUTHORIZED", "INVALID_INPUT", "INVALID_SCHEDULE", "INVALID_LOCAL_TIME", "INVALID_CONFIGURATION", "CLIENT_UNAVAILABLE", "CLIENT_EXISTS", "BLOCKED_CLIENT", "SERVICE_UNAVAILABLE", "PET_UNAVAILABLE", "INVALID_PRICE", "QUOTE_UNAVAILABLE", "REVIEW_REQUIRED", "PRICE_CHANGED", "VISIT_ALREADY_STARTED", "SCHEDULE_CONFLICT"];
  if (safe.includes(error.code) || error.code?.startsWith("OWNER_")) return { ok: false, code: error.code, error: error.message };
  if (error.code === "P2002") return { ok: false, error: "A matching record was just created. Search for the client or retry your reviewed booking." };
  if (error.code === "P2034") return { ok: false, error: "The schedule changed while saving. Retry to check availability again." };
  return { ok: false, error: "The booking could not be processed. Please retry." };
}

export async function searchScheduleClients(query) {
  const session = await requireAuth();
  try { return { ok: true, ...(await manualOptions(prisma, session.user.id, query)) }; }
  catch (error) { return failure(error); }
}

export async function reviewManualBooking(input) {
  const session = await requireAuth();
  try { return { ok: true, ...(await quoteManualBooking({ db: prisma, actorId: session.user.id, input, secret: process.env.NEXTAUTH_SECRET })) }; }
  catch (error) { return failure(error); }
}

export async function saveManualBooking(input, token) {
  const session = await requireAuth();
  let result;
  try { result = await createManualBooking({ db: prisma, actorId: session.user.id, input, token, secret: process.env.NEXTAUTH_SECRET }); }
  catch (error) { return failure(error); }
  // A cache refresh failure must not turn a committed booking into a failed save.
  try {
    for (const path of ["/dashboard/schedule", "/dashboard/operator", "/dashboard/operator/operations", "/dashboard/sitter"]) revalidatePath(path);
  } catch { /* The dynamic schedule will read the committed visits on navigation. */ }
  return { ok: true, ...result };
}
