// src/app/book/[serviceCode]/page.jsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPublicServices, getPublicExtras } from "../actions";
import PublicBookingWizard from "./PublicBookingWizard";

function toPlain(value) {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map(toPlain);
  }

  if (typeof value === "object") {
    if (typeof value.toNumber === "function") {
      return value.toNumber();
    }

    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = toPlain(val);
    }
    return out;
  }

  return value;
}

export default async function BookServicePage({ params }) {
  const { serviceCode } = await Promise.resolve(params);

  const rawServices = await getPublicServices();
  const rawExtraOptions = await getPublicExtras();

  const providerUser = await prisma.user.findFirst({
    where: {
      email: "lunajobs13@gmail.com",
      role: "SITTER",
    },
    select: {
      id: true,
    },
  });

  const services = toPlain(rawServices).map((service) => ({
    ...service,
    sitterId:
      service.sitterId || service.providerUserId || providerUser?.id || null,
  }));

  const extraOptions = toPlain(rawExtraOptions);

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
          extraOptions={extraOptions}
        />
      </div>
    </main>
  );
}
