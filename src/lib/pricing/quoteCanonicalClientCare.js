import "server-only";

import { prisma } from "@/lib/db";
import {
  CanonicalClientQuoteError,
  calculateCanonicalClientQuote,
} from "./calculateCanonicalClientQuote.js";

export async function quoteCanonicalClientCare({ careOptionCode, pets }) {
  const normalizedCode =
    typeof careOptionCode === "string" ? careOptionCode.trim() : "";
  if (!normalizedCode) {
    throw new CanonicalClientQuoteError(
      "INVALID_OPTION_CODE",
      "careOptionCode is required.",
    );
  }

  const careOption = await prisma.careOption.findUnique({
    where: { code: normalizedCode },
    include: {
      offering: { include: { speciesPolicies: true } },
      clientRate: { include: { petCharges: true } },
    },
  });

  return calculateCanonicalClientQuote({ careOption, pets });
}
