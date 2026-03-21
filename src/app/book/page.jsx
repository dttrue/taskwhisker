// src/app/book/page.jsx
import { Suspense } from "react";
import BookServiceChooser from "./BookServiceChooser";
import BookServiceChooserSkeleton from "./BookServiceChooserSkeleton";
import { prisma } from "@/lib/db";

async function ServiceChooserLoader() {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const services = await prisma.service.findMany({
    where: {
      isActive: true,
      category: { in: ["OVERNIGHT", "DROP_IN", "WALK"] },
    },
    orderBy: [{ species: "asc" }, { category: "asc" }, { name: "asc" }],
  });

  const serviceOptions = services.map((service) => ({
    id: service.id,
    code: service.code,
    name: service.name,
    species: service.species,
    category: service.category,
    basePriceCents: service.basePriceCents,
    durationMinutes: service.durationMinutes,
    notes: service.notes,
  }));

  return <BookServiceChooser services={serviceOptions} />;
}

export default function BookPage() {
  return (
    <Suspense fallback={<BookServiceChooserSkeleton />}>
      <ServiceChooserLoader />
    </Suspense>
  );
}