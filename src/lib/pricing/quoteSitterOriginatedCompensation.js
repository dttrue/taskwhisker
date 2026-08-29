import "server-only";

import { prisma } from "@/lib/db";
import {
  buildSitterOriginatedCompensationResolverInput,
  quoteSitterOriginatedCompensationWithDb,
} from "./sitterOriginatedCompensationResolver.js";

export function quoteSitterOriginatedCompensation(input) {
  return quoteSitterOriginatedCompensationWithDb(
    buildSitterOriginatedCompensationResolverInput(input, prisma),
  );
}
