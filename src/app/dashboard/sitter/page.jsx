// src/app/dashboard/sitter/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import SitterDashboardLive from "./_components/SitterDashboardLive";

export default async function SitterDashboardPage() {
  const session = await requireRole(["SITTER"]);
  const userId = session.user?.id;

  if (!userId) {
    throw new Error("Missing user id in session for sitter.");
  }

  const bookings = await prisma.booking.findMany({
    where: {
      sitterId: userId,
    },
    orderBy: { startTime: "asc" },
    include: {
      client: true,
      visits: {
        orderBy: { startTime: "asc" },
      },
    },
  });

  function serializeForClient(value) {
    if (value === null || value === undefined) return value;

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map(serializeForClient);
    }

    if (typeof value === "object") {
      // Prisma Decimal
      if (typeof value.toNumber === "function") {
        return value.toNumber();
      }

      const output = {};
      for (const [key, nestedValue] of Object.entries(value)) {
        output[key] = serializeForClient(nestedValue);
      }
      return output;
    }

    return value;
  }

  const serializedBookings = serializeForClient(bookings);

  return <SitterDashboardLive bookings={serializedBookings} />;
}
  