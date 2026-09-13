import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const migrationName = "20260912000000_add_canonical_booking_contract";
export async function authenticateCanonicalQa() {
  const expected = process.env.TASKWHISKER_QA_BRANCH_ID?.trim();
  assert(expected && !expected.endsWith("j4y"), "Configured disposable QA branch required; shared branch rejected.");
  assert(process.env.DATABASE_URL && process.env.DIRECT_URL, "Both database URLs are required.");
  async function identity(url) {
    const db = new PrismaClient({ datasources: { db: { url } } });
    try {
      const [row] = await db.$queryRaw`SELECT current_setting('neon.branch_id', true) AS "branchId", current_setting('neon.project_id', true) AS "projectId", current_database() AS "databaseName"`;
      assert(row?.branchId === expected && row.projectId && row.databaseName, "Database identity is not the configured disposable QA branch.");
      return row;
    } catch { throw new Error("Database identity authentication failed; no mutation permitted."); }
    finally { await db.$disconnect(); }
  }
  const identities = await Promise.all([identity(process.env.DATABASE_URL), identity(process.env.DIRECT_URL)]);
  assert.deepEqual(identities[0], identities[1], "Runtime and direct connection identities must agree.");
}
export async function protectedState(db) {
  const counts = Object.fromEntries(await Promise.all(Prisma.dmmf.datamodel.models.map(async ({ name }) => {
    const model = name[0].toLowerCase() + name.slice(1);
    return [name, await db[model].count()];
  })));
  const legacyMoney = await db.booking.findMany({ orderBy: { id: "asc" }, select: { id: true, clientTotalCents: true, platformFeeCents: true, sitterPayoutCents: true } });
  return { counts, legacyMoney };
}
async function main() {
  const mode = process.argv[2];
  assert(["capture", "apply", "verify"].includes(mode), "Use capture, apply or verify.");
  await authenticateCanonicalQa();
  const db = new PrismaClient();
  const baselinePath = "/tmp/taskwhisker-canonical-booking-baseline.json";
  try {
    const migrations = await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
    if (mode === "capture") {
      assert.equal(migrations.length, 30, "Expected exactly 30 existing migrations.");
      assert(migrations.every((row) => row.finished_at && !row.rolled_back_at));
      assert.equal(await db.bookingPricingSnapshot.count(), 0, "Existing pricing snapshots require a separate migration decision.");
      const state = await protectedState(db);
      await writeFile(baselinePath, JSON.stringify(state), { mode: 0o600, flag: "wx" });
      console.log(JSON.stringify({ safety: "both paths authenticated to configured disposable QA", migrationCount: migrations.length, counts: state.counts, baselineCaptured: true }));
    } else {
      const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
      assert.deepEqual(await protectedState(db), baseline, "Protected values/counts changed.");
      if (mode === "apply") {
        assert.equal(migrations.length, 30);
        assert(migrations.every((row) => row.finished_at && !row.rolled_back_at));
        const { readdir } = await import("node:fs/promises");
        const dirs = (await readdir("prisma/migrations", { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
        assert.deepEqual(dirs.filter((name) => !migrations.some((row) => row.migration_name === name)), [migrationName], "Only the approved new migration may be pending.");
        const sql = await readFile(`prisma/migrations/${migrationName}/migration.sql`, "utf8");
        const executable = sql.replace(/--[^\n]*/g, "");
        assert(!/\b(UPDATE|DELETE|TRUNCATE|INSERT|DROP\s+(?:TABLE|COLUMN))\b/i.test(executable), "Unexpected data mutation or destructive SQL.");
        const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "pipe", encoding: "utf8" });
        // Prisma may include connection details on failure; don't print its raw output.
        assert.equal(result.status, 0, "Focused migration failed; inspect locally with credentials redacted.");
      }
      const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      assert.equal(applied.length, 31); assert(applied.some((row) => row.migration_name === migrationName));
      const columns = await db.$queryRaw`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Booking' AND column_name IN ('clientTotalCents', 'platformFeeCents', 'sitterPayoutCents')`;
      assert.equal(columns.length, 3); assert(columns.every((column) => column.is_nullable === "YES"));
      const historical = await db.booking.findMany();
      for (const booking of historical) {
        for (const field of ["canonicalCreationKey", "canonicalInputHash", "careOfferingId", "careOfferingCode", "careOptionId", "careOptionCode", "billingUnit", "scheduleKind", "durationMinutes", "quantity", "scheduleTimeZone", "canonicalSchedule"]) assert.equal(booking[field], null, `Historical ${field} must remain null.`);
      }
      assert.deepEqual(await protectedState(db), baseline);
      console.log(JSON.stringify({ safety: "both paths authenticated", migrationCount: applied.length, legacyValuesUnchanged: true, protectedCountsUnchanged: true, historicalCanonicalFieldsNull: true, pricingSnapshotBackfill: false }));
    }
  } finally { await db.$disconnect(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error("Canonical QA guard/verification failed. No connection secrets are logged."); process.exitCode = 1; });
