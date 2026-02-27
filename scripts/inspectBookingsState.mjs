// scripts/inspectBookingsState.mjs
import "dotenv/config";
import pkg from "@prisma/client";

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString() : "—";
}

async function main() {
  console.log("🔍 Inspecting latest bookings + history...\n");

  // Grab the 10 most recent bookings
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      client: true,
      sitter: true,
      history: {
        orderBy: { createdAt: "asc" },
        include: { changedBy: true, fromSitter: true, toSitter: true },
      },
    },
  });

  if (!bookings.length) {
    console.log("No bookings found.");
    return;
  }

  for (const b of bookings) {
    console.log("===============================================");
    console.log(`📦 Booking ID: ${b.id}`);
    console.log(
      `Client: ${b.client?.name || "—"} (${b.client?.email || "no email"})`
    );
    console.log(`Sitter: ${b.sitter?.name || b.sitter?.email || "Unassigned"}`);
    console.log(`Status: ${b.status}`);
    console.log(`Window: ${fmt(b.startTime)} → ${fmt(b.endTime)}`);
    console.log(
      `Money: total=$${(b.clientTotalCents / 100).toFixed(2)}, fee=$${(
        b.platformFeeCents / 100
      ).toFixed(2)}, payout=$${(b.sitterPayoutCents / 100).toFixed(2)}`
    );
    console.log(
      `Timestamps: confirmed=${fmt(b.confirmedAt)}, canceled=${fmt(
        b.canceledAt
      )}, completed=${fmt(b.completedAt)}`
    );

    console.log("\nHistory:");
    if (!b.history.length) {
      console.log("  (no history rows)");
    } else {
      for (const h of b.history) {
        let line = `  - ${fmt(h.createdAt)} · `;

        if (h.toStatus) {
          line += `${h.fromStatus || "—"} → ${h.toStatus}`;
        } else if (h.fromSitterId || h.toSitterId) {
          line += `sitter: ${
            h.fromSitter?.name || h.fromSitter?.email || "—"
          } → ${h.toSitter?.name || h.toSitter?.email || "Unassigned"}`;
        } else {
          line += "unknown change";
        }

        if (h.changedBy?.email) {
          line += ` · by ${h.changedBy.email}`;
        }

        if (h.note) {
          line += ` · note: ${h.note}`;
        }

        console.log(line);
      }
    }

    console.log("\n");
  }

  console.log("✅ Done.");
}

main()
  .catch((err) => {
    console.error("❌ Error in inspectBookingsState:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
