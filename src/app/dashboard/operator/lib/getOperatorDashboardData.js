// src/app/dashboard/operator/lib/getOperatorDashboardData.js
import { prisma } from "@/lib/db";

/**
 * Fetch bookings + simple metrics for the operator dashboard.
 *
 * @param {Object} params
 * @param {string} params.operatorId - User.id of the operator (Bridget).
 * @param {string | undefined} params.from - ISO date string "YYYY-MM-DD".
 * @param {string | undefined} params.to   - ISO date string "YYYY-MM-DD".
 * @param {string | undefined} params.status - BookingStatus or "ALL".
 */
export async function getOperatorDashboardData({
  operatorId,
  from,
  to,
  status,
}) {
  if (!operatorId) {
    throw new Error("operatorId is required for operator dashboard");
  }

  // Build base where clause
  const where = {
    operatorId,
  };

  // Date range filter (inclusive of entire 'to' day)
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    where.startTime = {
      gte: fromDate,
      lte: toDate,
    };
  }

  // Status filter (skip if "ALL" or empty)
  if (status && status !== "ALL") {
    where.status = status;
  }

  // Fetch bookings for this operator
  const bookings = await prisma.booking.findMany({
    where,
    include: {
      client: true,
      sitter: true,
      lineItems: true,
    },
    orderBy: {
      startTime: "asc",
    },
  });

  // Compute simple metrics for the pills/cards
  const statsByStatus = {
    ALL: { count: 0, totalCents: 0 },
    REQUESTED: { count: 0, totalCents: 0 },
    CONFIRMED: { count: 0, totalCents: 0 },
    COMPLETED: { count: 0, totalCents: 0 },
    CANCELED: { count: 0, totalCents: 0 },
  };

  for (const booking of bookings) {
    const cents = booking.clientTotalCents ?? 0;

    // Overall
    statsByStatus.ALL.count += 1;
    statsByStatus.ALL.totalCents += cents;

    // Per status
    const s = booking.status;
    if (!statsByStatus[s]) {
      statsByStatus[s] = { count: 0, totalCents: 0 };
    }
    statsByStatus[s].count += 1;
    statsByStatus[s].totalCents += cents;
  }

  return {
    bookings,
    statsByStatus,
  };
}
