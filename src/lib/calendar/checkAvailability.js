import { prisma } from "@/lib/db";
import { checkAvailabilityWithDb } from "./availabilityContract.js";
export function checkAvailability(input) { return checkAvailabilityWithDb(prisma, input); }
