import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { authenticateCanonicalQa } from "./canonical-booking-qa.mjs";
import { resolveBusinessOwnerIdentityWithDb } from "../src/lib/bookings/businessOwnerIdentityContract.js";
export const migrationName = "20260916000000_visit_compensation_foundation";
export const newModels = ["VisitSitterCompensationAuthorization", "VisitCompensationAuthorizationPetCharge", "VisitCompensationAuthorizationVoid", "VisitSitterCompensationAllocation", "VisitFinancialReview"];
export async function cleanupVisitFinance(tx, bookingIds) {
  const visits = { bookingId: { in: bookingIds } };
  await tx.visitFinancialReview.deleteMany({ where: { visit: visits } });
  await tx.visitSitterCompensationAllocation.deleteMany({ where: { visit: visits } });
  await tx.visitCompensationAuthorizationVoid.deleteMany({ where: { authorization: visits } });
  await tx.visitCompensationAuthorizationPetCharge.deleteMany({ where: { authorization: visits } });
  // Descending revision permits restrictive predecessor FKs in future fixtures.
  const rows = await tx.visitSitterCompensationAuthorization.findMany({ where: visits, orderBy: { revision: "desc" }, select: { id: true } });
  for (const row of rows) await tx.visitSitterCompensationAuthorization.delete({ where: { id: row.id } });
}
async function state(db) {
  const counts = Object.fromEntries(await Promise.all(Prisma.dmmf.datamodel.models.filter(({ name }) => !newModels.includes(name)).map(async ({ name }) => [name, await db[name[0].toLowerCase() + name.slice(1)].count()])));
  const legacyMoney = await db.booking.findMany({ orderBy: { id: "asc" }, select: { id: true, clientTotalCents: true, platformFeeCents: true, sitterPayoutCents: true } });
  return { counts, legacyMoney };
}
async function main() {
  const mode = process.argv[2]; assert(["inspect", "apply", "verify"].includes(mode));
  await authenticateCanonicalQa();
  const db = new PrismaClient();
  try {
    await resolveBusinessOwnerIdentityWithDb({ db });
    const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const dirs = (await readdir("prisma/migrations", { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    if (mode === "inspect") { console.log(JSON.stringify({ bothUrlsAuthenticated: true, configuredOwnerValidated: true, pendingCount: dirs.filter((n) => !applied.some((a) => a.migration_name === n)).length })); return; }
    const baselinePath = "/tmp/taskwhisker-visit-compensation-baseline.json";
    if (mode === "apply") {
      assert.deepEqual(dirs.filter((n) => !applied.some((a) => a.migration_name === n)), [migrationName]);
      const sql = await readFile(`prisma/migrations/${migrationName}/migration.sql`, "utf8");
      assert(!/\b(?:TRUNCATE|DROP\s+(?:TABLE|COLUMN)|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+")/i.test(sql));
      const baseline = await state(db);
      await writeFile(baselinePath, JSON.stringify(baseline), { mode: 0o600, flag: "wx" });
      const result = spawnSync("./node_modules/.bin/prisma", ["migrate", "deploy"], { encoding: "utf8" });
      if (result.status !== 0) { await writeFile("/tmp/taskwhisker-visit-migration-error.log", result.stderr + result.stdout, { mode: 0o600 }); throw new Error("Migration failed; output withheld."); }
    }
    assert.deepEqual(await state(db), JSON.parse(await readFile(baselinePath, "utf8")));
    for (const model of newModels) assert.equal(await db[model[0].toLowerCase() + model.slice(1)].count(), 0);
    const status = spawnSync("./node_modules/.bin/prisma", ["migrate", "status"], { encoding: "utf8" });
    assert.equal(status.status, 0); assert.match(status.stdout, /up to date/i);
    const checks = await db.$queryRaw`SELECT count(*)::int AS n FROM pg_constraint WHERE contype = 'c' AND conrelid IN ('"VisitSitterCompensationAuthorization"'::regclass, '"VisitSitterCompensationAllocation"'::regclass, '"VisitFinancialReview"'::regclass)`;
    assert.equal(checks[0].n, 4);
    console.log(JSON.stringify({ bothUrlsAuthenticated: true, configuredOwnerValidated: true, migrationApplied: true, migrateStatus: "up to date", protectedStateUnchanged: true, newTablesEmpty: true, financialCheckConstraints: checks[0].n, protectedCounts: (await state(db)).counts }));
  } finally { await db.$disconnect(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error("Visit compensation QA verification failed. Connection details withheld."); process.exitCode = 1; });
