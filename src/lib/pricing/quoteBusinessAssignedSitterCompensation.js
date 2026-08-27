import "server-only";

import { prisma } from "@/lib/db";
import {
  BusinessAssignedSitterCompensationError,
  calculateBusinessAssignedSitterCompensation,
  selectBusinessAssignedSitterRate,
  validateBusinessAssignedSitter,
} from "./calculateBusinessAssignedSitterCompensation.js";

function reject(code, message) {
  throw new BusinessAssignedSitterCompensationError(code, message);
}

export async function quoteBusinessAssignedSitterCompensation({
  careOptionCode,
  sitterId,
  pets,
  quantity,
}) {
  const normalizedCode =
    typeof careOptionCode === "string" ? careOptionCode.trim() : "";
  const normalizedSitterId =
    typeof sitterId === "string" ? sitterId.trim() : "";
  if (!normalizedCode || !normalizedSitterId) {
    reject("INVALID_INPUT", "careOptionCode and sitterId are required.");
  }

  const sitter = await prisma.user.findUnique({
    where: { id: normalizedSitterId },
    select: { id: true, role: true },
  });
  validateBusinessAssignedSitter(sitter, normalizedSitterId);

  const careOption = await prisma.careOption.findUnique({
    where: { code: normalizedCode },
    include: {
      clientRate: true,
      defaultSitterRate: { include: { petCharges: true } },
      sitterRates: {
        where: { sitterId: normalizedSitterId },
        include: { petCharges: true },
      },
    },
  });
  if (!careOption) {
    reject("CARE_OPTION_NOT_FOUND", "The canonical care option does not exist.");
  }

  const { rate, rateSource } = selectBusinessAssignedSitterRate({
    sitterRate: careOption.sitterRates[0] ?? null,
    defaultRate: careOption.defaultSitterRate,
  });

  return calculateBusinessAssignedSitterCompensation({
    careOption,
    rate,
    rateSource,
    sitterId: sitter.id,
    pets,
    quantity,
  });
}
