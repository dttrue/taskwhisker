import "server-only";

import { prisma } from "@/lib/db";
import {
  PublicCanonicalCareError,
  buildPublicCanonicalCareCatalog,
} from "./publicCanonicalCare.js";

export async function getPublicCanonicalCareCatalog(input = {}) {
  try {
    const { pets } = input ?? {};
    const careOptions = await prisma.careOption.findMany({
      where: {
        isActive: true,
        offering: { isActive: true },
      },
      select: {
        code: true,
        label: true,
        primarySpecies: true,
        durationMinutes: true,
        isActive: true,
        sortOrder: true,
        offering: {
          select: {
            code: true,
            name: true,
            description: true,
            billingUnit: true,
            scheduleKind: true,
            allowsMixedSpecies: true,
            allowsUnlistedSpecies: true,
            minimumPetCount: true,
            maximumPetCount: true,
            isActive: true,
            sortOrder: true,
            speciesPolicies: {
              select: {
                species: true,
                isSupported: true,
                minimumCount: true,
                maximumCount: true,
              },
            },
          },
        },
        clientRate: {
          select: {
            id: true,
            currency: true,
            baseRateCents: true,
            includedPetCount: true,
            defaultAdditionalCents: true,
            version: true,
            isActive: true,
            petCharges: {
              select: {
                species: true,
                includedCount: true,
                additionalCents: true,
              },
            },
          },
        },
      },
      orderBy: [
        { offering: { sortOrder: "asc" } },
        { sortOrder: "asc" },
        { code: "asc" },
      ],
    });

    return buildPublicCanonicalCareCatalog({ careOptions, pets });
  } catch (error) {
    if (error instanceof PublicCanonicalCareError) throw error;
    throw new PublicCanonicalCareError(
      "UNEXPECTED_SERVER_ERROR",
      "Unable to load canonical care options.",
    );
  }
}
