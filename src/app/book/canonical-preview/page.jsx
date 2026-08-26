import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageShell } from "@/components/ui/Foundation";
import CanonicalBookingPreviewWizard from "./CanonicalBookingPreviewWizard";
import { resolveDefaultPublicBookingSitter } from "@/lib/bookings/resolveDefaultPublicBookingSitter";

function plain(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") {
    if (typeof value.toNumber === "function") return value.toNumber();
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, plain(item)]),
    );
  }
  return value;
}

export default async function CanonicalBookingPreviewPage() {
  const enabled =
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_CANONICAL_BOOKING_PREVIEW === "1";

  if (!enabled) notFound();

  const [sitter, extras] = await Promise.all([
    resolveDefaultPublicBookingSitter(),
    prisma.service.findMany({
      where: { isActive: true, category: "EXTRA" },
      orderBy: [{ species: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <PageShell containerClassName="max-w-4xl">
      <CanonicalBookingPreviewWizard
        sitterId={sitter?.id ?? null}
        extraOptions={plain(extras)}
      />
    </PageShell>
  );
}
