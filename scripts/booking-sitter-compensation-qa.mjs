import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { authenticateCanonicalQa } from "./canonical-booking-qa.mjs";

export const migrationName = "20260913000000_add_booking_sitter_compensation";
const newModels = ["BookingSitterCompensation", "BookingSitterCompensationPetCharge"];
export async function compensationProtectedState(db, includeNew = true) {
  const counts = Object.fromEntries(await Promise.all(Prisma.dmmf.datamodel.models
    .filter(({ name }) => includeNew || !newModels.includes(name)).map(async ({ name }) => [name, await db[name[0].toLowerCase() + name.slice(1)].count()])));
  const legacyMoney = await db.booking.findMany({ orderBy: { id: "asc" }, select: { id: true, clientTotalCents: true, platformFeeCents: true, sitterPayoutCents: true } });
  return { counts, legacyMoney };
}
export function inspectCompensationMigration(sql) {
  const statements = sql.replace(/--[^\n]*/g, "").split(";").map((s) => s.trim()).filter(Boolean);
  assert(statements.length > 10);
  for (const statement of statements) {
    assert(/^(CREATE TYPE "BookingSitterRateSource"|CREATE TABLE "BookingSitterCompensation(?:PetCharge)?"|CREATE (?:UNIQUE )?INDEX "BookingSitterCompensation[^"\n]*" ON "BookingSitterCompensation(?:PetCharge)?"|ALTER TABLE "BookingSitterCompensation(?:PetCharge)?" ADD CONSTRAINT )/.test(statement), "Only additive compensation DDL is allowed.");
    assert(!/\b(?:INSERT INTO|DELETE FROM|TRUNCATE|DROP|UPDATE\s+")/i.test(statement), "Data mutation or destructive SQL is forbidden.");
  }
  assert(!/ON DELETE CASCADE/i.test(sql));
  return statements.length;
}
async function main() {
  const mode = process.argv[2]; assert(["capture", "apply", "verify"].includes(mode));
  await authenticateCanonicalQa();
  const db = new PrismaClient();
  const baselinePath = "/tmp/taskwhisker-booking-sitter-compensation-baseline.json";
  try {
    const migrations = await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
    assert(migrations.every((m) => m.finished_at && !m.rolled_back_at));
    if (mode === "capture") {
      assert.equal(migrations.length, 31);
      const baseline = await compensationProtectedState(db, false);
      await writeFile(baselinePath, JSON.stringify(baseline), { mode: 0o600, flag: "wx" });
      console.log(JSON.stringify({ safety: "both URL paths authenticated to configured disposable QA", migrations: 31, protectedCounts: baseline.counts, baselineCaptured: true }));
      return;
    }
    const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
    assert.deepEqual(await compensationProtectedState(db, false), baseline);
    if (mode === "apply") {
      assert.equal(migrations.length, 31);
      const dirs = (await readdir("prisma/migrations", { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
      assert.deepEqual(dirs.filter((name) => !migrations.some((m) => m.migration_name === name)), [migrationName]);
      const statements = inspectCompensationMigration(await readFile(`prisma/migrations/${migrationName}/migration.sql`, "utf8"));
      const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "pipe", encoding: "utf8" });
      assert.equal(result.status, 0, "QA migration failed; raw credential-bearing output withheld.");
      console.log(JSON.stringify({ additiveStatementsInspected: statements, onlyNewMigrationApplied: true }));
    }
    const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.equal(applied.length, 32); assert(applied.some((m) => m.migration_name === migrationName));
    const constraints = await db.$queryRaw`SELECT conname FROM pg_constraint WHERE conrelid IN ('"BookingSitterCompensation"'::regclass, '"BookingSitterCompensationPetCharge"'::regclass) AND contype = 'c'`;
    assert.equal(constraints.length, 4);
    for (const name of newModels) assert.equal(await db[name[0].toLowerCase() + name.slice(1)].count(), 0);
    assert.deepEqual(await compensationProtectedState(db, false), baseline);
    const status = spawnSync("npx", ["prisma", "migrate", "status"], { stdio: "pipe", encoding: "utf8" });
    assert.equal(status.status, 0); assert.match(status.stdout, /up to date/i);
    console.log(JSON.stringify({ safety: "both URL paths authenticated", migrations: 32, migrateStatus: "up to date", protectedCountsAndLegacyMoneyUnchanged: true, newTablesEmpty: true, checkConstraints: constraints.length }));
  } finally { await db.$disconnect(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error("Compensation QA guard/verification failed; no secrets logged."); process.exitCode = 1; });
