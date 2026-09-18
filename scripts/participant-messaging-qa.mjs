import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const { authenticateCanonicalQa } = await import('./canonical-booking-qa.mjs');
const { compensationProtectedState } = await import('./booking-sitter-compensation-qa.mjs');
const { PrismaClient } = await import('@prisma/client');
export const migrationName = '20260918000000_visit_participant_messaging';
export async function messagingProtectedState(db) {
  return {
    conversations: await db.$queryRaw`SELECT id, "bookingId", "createdAt", "updatedAt" FROM "Conversation" ORDER BY id`,
    messages: (await db.$queryRaw`SELECT row_to_json(m) AS row FROM "Message" m ORDER BY id`).map(r => r.row),
    participants: (await db.$queryRaw`SELECT row_to_json(p) AS row FROM "ConversationParticipant" p ORDER BY id`).map(r => r.row),
    visits: (await db.$queryRaw`SELECT row_to_json(v) AS row FROM "Visit" v ORDER BY id`).map(({ row: { assignmentRevision: _revision, ...row } }) => row),
    protected: await compensationProtectedState(db),
  };
}
async function main() {
  await authenticateCanonicalQa();
  const db = new PrismaClient({ log: [] });
  try {
    const before = await messagingProtectedState(db);
    const applied = await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
    assert(applied.every(m => m.finished_at && !m.rolled_back_at));
    const dirs = (await readdir('prisma/migrations', { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name);
    const pending = dirs.filter(name => !applied.some(m => m.migration_name === name));
    if (process.argv[2] === 'apply') {
      assert.deepEqual(pending, [migrationName], 'Only the approved messaging migration may be pending.');
      const result = spawnSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { encoding: 'utf8', env: process.env });
      assert.equal(result.status, 0, 'QA migration failed; credential-bearing output withheld.');
      assert.deepEqual(await messagingProtectedState(db), before, 'Pre-existing data changed.');
      assert.equal(await db.conversation.count({ where: { scope: 'BOOKING' } }), before.conversations.length);
      assert.equal(await db.conversation.count({ where: { scope: 'COVERAGE_VISIT' } }), 0);
      assert.equal(await db.visit.count({ where: { assignmentRevision: { not: 1 } } }), 0);
      console.log('QA migration applied: all conversation/message/read-state IDs and values preserved; Visit baseline 1; protected counts unchanged.');
    } else assert.deepEqual(pending, []);
    const result = spawnSync('node_modules/.bin/prisma', ['migrate', 'status'], { encoding: 'utf8', env: process.env });
    assert.equal(result.status, 0); assert.match(result.stdout, /up to date/i);
    console.log('Both URLs authenticated to disposable QA; migration status up to date.');
  } finally { await db.$disconnect(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Messaging QA guard or migration verification failed; secrets withheld.'); process.exitCode = 1; });
