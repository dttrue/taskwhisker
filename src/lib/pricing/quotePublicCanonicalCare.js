import "server-only";

import { quoteCanonicalClientCare } from "./quoteCanonicalClientCare.js";
import {
  toPublicCanonicalQuote,
  translatePublicQuoteError,
} from "./publicCanonicalCare.js";

export async function quotePublicCanonicalCare(input = {}) {
  try {
    const { careOptionCode, pets } = input ?? {};
    const quote = await quoteCanonicalClientCare({ careOptionCode, pets });
    return toPublicCanonicalQuote(quote);
  } catch (error) {
    throw translatePublicQuoteError(error);
  }
}
