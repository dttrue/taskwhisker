"use server";

import { getPublicCanonicalCareCatalog } from "@/lib/pricing/getPublicCanonicalCareCatalog";
import { PublicCanonicalCareError } from "@/lib/pricing/publicCanonicalCare";

export async function loadCanonicalPreviewCatalog(pets) {
  try {
    return {
      ok: true,
      catalog: await getPublicCanonicalCareCatalog({ pets }),
    };
  } catch (error) {
    if (error instanceof PublicCanonicalCareError) {
      return { ok: false, code: error.code, error: error.message };
    }

    return {
      ok: false,
      code: "UNEXPECTED_SERVER_ERROR",
      error: "Unable to load care options right now.",
    };
  }
}
