import { prisma } from "@/lib/db";
import { checkBlockedClientWithDb } from "./blockedClientContract.js";
export function checkBlockedClient(input = {}) { return checkBlockedClientWithDb(prisma, input); }
