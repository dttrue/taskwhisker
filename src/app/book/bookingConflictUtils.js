// src/app/book/bookingConflictUtils.js
import { prisma } from "@/lib/db";
import { VisitStatus } from "@prisma/client";

export async function checkConflictsForOperator({ operatorId, visits }) {
  for (const v of visits) {
    const conflict = await prisma.visit.findFirst({
      where: {
        operatorId,
        status: { not: VisitStatus.CANCELED },
        startTime: { lt: v.endTime },
        endTime: { gt: v.startTime },
      },
    });

    if (conflict) {
      return {
        hasConflict: true,
        conflictVisitId: conflict.id,
      };
    }
  }

  return {
    hasConflict: false,
    conflictVisitId: null,
  };
}
