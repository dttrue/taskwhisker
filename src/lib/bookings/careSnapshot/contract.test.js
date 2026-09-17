import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureCareInstructions, participantCareReady } from './contract.js';
import { participantFixture } from "./fixtures.js";
import { participantCareDto } from '../handoff/participation.js';
import { surfaceLoader } from '../surfaceTestSupport.js';
import { renderToStaticMarkup } from 'react-dom/server';

for (const value of [undefined, null, '', '   ']) test(`captured empty ${JSON.stringify(value)} has explicit provenance`, () => {
  assert.deepEqual(captureCareInstructions(value), { careInstructionsVersion: 1, careInstructions: null });
});
test('normalization preserves feeding, medication and routine without truncation', () => {
  const text = 'Feeding\nMedication\nRoutine';
  assert.equal(captureCareInstructions(`  ${text}  `).careInstructions, text);
  assert.throws(() => captureCareInstructions('x'.repeat(1001)));
});
test('trusted participant care is explicit, own-only and excludes generic notes/history/financial internals', async () => {
  const b = await participantFixture(), dto = participantCareDto(b, 'bob');
  assert.equal(dto.careInstructions, b.careInstructions); assert.equal(dto.visits.length, 1);
  assert(!JSON.stringify(dto).includes('PRIVATE'));
  for (const key of ['notes','history','conversation','sitterCompensation','rewardReservation','careInstructionsVersion']) assert(!Object.hasOwn(dto,key));
  assert.equal(participantCareDto(b,'unrelated-sitter'), null);
});
for (const label of ['Seeded booking: internal description','reward-qa-marker','reservation-qa-marker']) test(`${label} never becomes care`, async () => {
  const b = await participantFixture(); b.notes = label; b.careInstructionsVersion = null; b.careInstructions = null;
  assert.equal(participantCareReady(b), false);
  assert.deepEqual(participantCareDto(b,'bob'), { kind: 'VISIT_PARTICIPANT', bookingId: b.id, unavailable: true });
  assert.deepEqual(participantCareDto(b,'sitter'), { kind:'LEAD', bookingId:b.id, useLeadView:true });
});
test('actual care component renders all instructions, preserves whitespace and uses trusted empty state', async () => {
  const b = await participantFixture(), { CareInstructions } = surfaceLoader(b).load('app/dashboard/sitter/_components/ParticipantVisit.jsx');
  const html = renderToStaticMarkup(CareInstructions({text:b.careInstructions}));
  for (const text of ['Feeding: one bowl.', 'Medication: follow the provided label.', 'Routine: short walk.']) assert(html.includes(text));
  assert(html.includes('whitespace-pre-wrap'));
  assert(renderToStaticMarkup(CareInstructions({text:null})).includes('No additional care instructions provided.'));
});
test('real creation writers capture explicit care input; seeds and QA markers do not set provenance', () => {
  for (const path of ['src/app/book/actions.js','src/lib/bookings/canonical/createCanonicalBooking.js']) {
    const source = readFileSync(path,'utf8'); assert.match(source,/\.\.\.captureCareInstructions\((?:intent\.)?notes\)/);
  }
  for (const path of ['prisma/seed.js','src/lib/rewards/rewardProgressGrant.integration.test.js','src/lib/rewards/rewardReservation.integration.test.js']) {
    assert.doesNotMatch(readFileSync(path,'utf8'),/careInstructionsVersion|captureCareInstructions/);
  }
  const sql=readFileSync('prisma/migrations/20260917000000_booking_care_snapshot/migration.sql','utf8');
  assert.doesNotMatch(sql,/\bUPDATE\b|\bDEFAULT\b|Booking\.notes/i);
  assert.match(sql,/ADD COLUMN "careInstructions" TEXT/); assert.match(sql,/ADD COLUMN "careInstructionsVersion" INTEGER/);
});
