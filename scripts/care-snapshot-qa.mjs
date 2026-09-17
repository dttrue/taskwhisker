import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { authenticateCanonicalQa, protectedState } from './canonical-booking-qa.mjs';
const migration = '20260917000000_booking_care_snapshot';
const baselinePath = '/tmp/taskwhisker-care-snapshot-baseline.json';
async function main() {
  const mode = process.argv[2]; assert(['apply','verify'].includes(mode));
  await authenticateCanonicalQa();
  const db = new PrismaClient();
  // Raw projection also works before the new columns exist. Never printed.
  const bookings = () => db.$queryRaw`SELECT to_jsonb(b) - 'careInstructions' - 'careInstructionsVersion' AS data FROM "Booking" b ORDER BY id`;
  try {
    if (mode === 'apply') {
      const applied = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      const dirs = (await readdir('prisma/migrations',{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);
      assert.deepEqual(dirs.filter(name=>!applied.some(a=>a.migration_name===name)),[migration]);
      const sql=await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8');
      assert(!/\b(?:UPDATE|INSERT|DELETE|TRUNCATE|DROP|DEFAULT)\b/i.test(sql.replace(/--[^\n]*/g,'')));
      await writeFile(baselinePath,JSON.stringify({protected:await protectedState(db),bookings:await bookings()}),{mode:0o600,flag:'wx'});
      const run=spawnSync('./node_modules/.bin/prisma',['migrate','deploy'],{encoding:'utf8'});
      assert.equal(run.status,0,'QA migration deployment failed; connection output withheld.');
    }
    const baseline=JSON.parse(await readFile(baselinePath,'utf8'));
    assert.deepEqual(await protectedState(db),baseline.protected);
    assert.deepEqual(await bookings(),baseline.bookings);
    const rows=await db.booking.findMany({select:{careInstructions:true,careInstructionsVersion:true}});
    assert(rows.every(b=>b.careInstructions===null && b.careInstructionsVersion===null));
    const checks=await db.$queryRaw`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'Booking_care_snapshot_check'`;
    assert.equal(checks[0].n,1);
    const run=spawnSync('./node_modules/.bin/prisma',['migrate','status'],{encoding:'utf8'});
    assert.equal(run.status,0);assert.match(run.stdout,/up to date/i);
    console.log(JSON.stringify({bothUrlsAuthenticated:true,qaOnly:true,migrationStatus:'up to date',noBackfill:true,existingBookingsUnchanged:true,protectedCountsRestored:true,checkConstraint:true}));
  } finally {await db.$disconnect();}
}
main().catch(()=>{console.error('Care snapshot QA guard/verification failed. Connection details withheld.');process.exitCode=1;});
