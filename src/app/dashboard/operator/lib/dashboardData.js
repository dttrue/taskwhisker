// src/app/dashboard/operator/lib/dashboardData.js
import { prisma } from "@/lib/db";
import { buildDateWhere } from "./dashboardQuery";

export function normalizeMetrics(grouped) {
  const base = {
    ALL: { count: 0, revenueCents: 0 },
    REQUESTED: { count: 0, revenueCents: 0 },
    CONFIRMED: { count: 0, revenueCents: 0 },
    COMPLETED: { count: 0, revenueCents: 0 },
    CANCELED: { count: 0, revenueCents: 0 },
  };

  for (const row of grouped) {
    const s = row.status;
    if (!base[s]) continue;
    base[s].count = row._count?._all ?? 0;
    base[s].revenueCents = row._sum?.clientTotalCents ?? 0;
  }

  base.ALL.count =
    base.REQUESTED.count +
    base.CONFIRMED.count +
    base.COMPLETED.count +
    base.CANCELED.count;

  base.ALL.revenueCents =
    base.REQUESTED.revenueCents +
    base.CONFIRMED.revenueCents +
    base.COMPLETED.revenueCents +
    base.CANCELED.revenueCents;

  return base;
}

export async function getOperatorDashboardData({
  operatorId,
  status,
  from,
  to,
}) {
  const dateWhere = buildDateWhere({ from, to });

  const where = {
    ...(operatorId ? { operatorId } : {}),
    ...dateWhere,
    ...(status && status !== "ALL" ? { status } : {}),
  };

  console.log("OP DASH final where:", JSON.stringify(where, null, 2));

  const [bookings, grouped] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        client: true,
        sitter: true,
        lineItems: true,
        visits: {
          orderBy: { startTime: "asc" },
        },
      },
      orderBy: { startTime: "asc" },
      take: 50,
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: {
        ...(operatorId ? { operatorId } : {}),
        ...dateWhere,
      },
      _count: { _all: true },
      _sum: { clientTotalCents: true },
    }),
  ]);

  console.log("OP DASH bookings count:", bookings.length);

  return { bookings, metrics: normalizeMetrics(grouped) };
}
