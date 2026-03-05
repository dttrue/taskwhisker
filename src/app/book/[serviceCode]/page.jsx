// src/app/book/[serviceCode]/page.jsx
import { notFound } from "next/navigation";
import { getPublicServices } from "../actions";
import PublicBookingWizard from "./PublicBookingWizard";

export default async function BookServicePage({ params }) {
  const { serviceCode } = await Promise.resolve(params);

  const services = await getPublicServices();
  const initialService = services.find((s) => s.code === serviceCode);

  if (!initialService) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-base-100">
      <div className="max-w-md mx-auto px-4 py-6">
        <PublicBookingWizard
          initialService={initialService}
          serviceOptions={services}
        />
      </div>
    </main>
  );
}
