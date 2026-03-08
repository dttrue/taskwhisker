// src/app/book/page.jsx
import { prisma } from "@/lib/db";
import PublicBookingForm from "./PublicBookingForm";

export default async function BookPage() {
  const services = await prisma.service.findMany({
    where: {
      isActive: true,
      category: { in: ["OVERNIGHT", "DROP_IN", "WALK"] },
    },
    orderBy: [{ species: "asc" }, { category: "asc" }, { name: "asc" }],
  });

  const extras = await prisma.service.findMany({
    where: {
      isActive: true,
      category: "EXTRA",
    },
    orderBy: [{ species: "asc" }, { name: "asc" }],
  });

  const serviceOptions = services.map((s) => ({
    id: s.id,
    code: s.code,
    label: s.name,
    serviceType: s.category,
    species: s.species,
    category: s.category,
    basePriceCents: s.basePriceCents,
    durationMinutes: s.durationMinutes,
    notes: s.notes,
  }));

  const extraOptions = extras.map((s) => ({
    id: s.id,
    code: s.code,
    label: s.name,
    species: s.species,
    category: s.category,
    basePriceCents: s.basePriceCents,
    durationMinutes: s.durationMinutes,
    notes: s.notes,
  }));

  return (
    <div className="max-w-md mx-auto py-8">
      <PublicBookingForm
        serviceOptions={serviceOptions}
        extraOptions={extraOptions}
      />
    </div>
  );
}
