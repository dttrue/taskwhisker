// src/lib/db.js
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const enableQueryLogs = process.env.PRISMA_LOG_QUERIES === "1";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: enableQueryLogs ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
