import "server-only";

import { prisma } from "../db.js";
import { recordQualifyingSitterOriginatedCompletionWithDb } from "./rewardProgressGrantWrites.js";

// Internal server entry point, not a browser-callable server action. No caller
// sitter, DB, clock, lane, progress, grant, or fee values cross this boundary.
export function recordQualifyingSitterOriginatedCompletion({ bookingId } = {}) {
  return recordQualifyingSitterOriginatedCompletionWithDb({ db: prisma, bookingId });
}
