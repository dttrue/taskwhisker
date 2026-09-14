"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/auth";
import { revalidatePath } from "next/cache";
import { completeVisitWithDb } from "@/lib/bookings/economics/completionService";

export async function completeVisitAsSitter(formData) {
  const session = await requireRole(["SITTER"]);
  const visitId = formData.get("visitId");
  if (!visitId) return { ok: false, error: "Missing visit id." };
  const result = await completeVisitWithDb({ db: prisma, visitId, actorId: session.user.id,
    actorRole: "SITTER", lateReason: formData.get("lateReason")?.toString().trim() || "" });
  if (result.ok) {
    revalidatePath("/dashboard/sitter");
    revalidatePath("/dashboard/operator");
    revalidatePath(`/dashboard/operator/bookings/${result.bookingId}`);
    revalidatePath(`/dashboard/sitter/bookings/${result.bookingId}`);
  }
  return result;
}
