// src/app/book/page.jsx
import { prisma } from "@/lib/db";
import PublicBookingForm from "./PublicBookingForm";

export default async function BookPage() {
  const services = await prisma.service.findMany({
    orderBy: [{ species: "asc" }, { category: "asc" }, { name: "asc" }],
  });

  // Normalize into options for the client form
  const serviceOptions = services.map((s) => ({
    code: s.code, // e.g. "DOG_OVERNIGHT_HOME"
    label: s.name, // e.g. "Dog Overnight (in your home)"
    serviceType: s.category, // assumes ServiceType enum matches category: OVERNIGHT, DROP_IN, WALK, EXTRA
    species: s.species, // DOG / CAT
    category: s.category, // OVERNIGHT / DROP_IN / WALK / EXTRA
  }));

  return (
    <div className="max-w-md mx-auto py-8">
      <PublicBookingForm serviceOptions={serviceOptions} />
    </div>
  );
}
