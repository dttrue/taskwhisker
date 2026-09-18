import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { approveCareInstructionsWithDb, careReviewKey } from './remediation.js';
import { participantFixture } from './fixtures.js';
import { coverageRows } from '../handoff/operatorSurface.js';
import { participantCareDto } from '../handoff/participation.js';
import { surfaceLoader } from '../surfaceTestSupport.js';

async function fixture() {
  const booking = await participantFixture();
  Object.assign(booking, { careInstructionsVersion: null, careInstructions: null, notes: 'Internal dispute\r\nPRIVATE $42  ', history: [] });
  const db = { $transaction: async work => work(db), $queryRaw: async () => [],
    user: { findUnique: async ({where}) => ({ role: where.id === 'operator' ? 'OPERATOR' : 'SITTER' }) },
    booking: { findUnique: async () => structuredClone(booking), update: async ({data}) => Object.assign(booking, data) },
    bookingHistory: { create: async ({data}) => { booking.history.push({id: String(booking.history.length), ...data}); } },
  };
  const save = (text, overrides = {}) => approveCareInstructionsWithDb({ db, actorId: 'operator', bookingId: booking.id, careInstructions: text, operationId: careReviewKey(booking), ...overrides });
  return { booking, db, save };
}

test('legacy approval trims only explicit text, preserves source and enables existing care guard', async () => {
  const {booking, save} = await fixture();
  const before = structuredClone(booking);
  assert(coverageRows(booking).every(row => !row.eligible));
  assert.equal((await save('  Feed twice.\nGive medicine.  ')).ok, true);
  assert.equal(booking.careInstructionsVersion, 1);
  assert.equal(booking.careInstructions, 'Feed twice.\nGive medicine.');
  assert.equal(booking.notes, before.notes);
  assert(coverageRows(booking).every(row => row.eligible));
  const dto = participantCareDto(booking, 'bob');
  assert.equal(dto.careInstructions, booking.careInstructions);
  assert(!JSON.stringify(dto).includes('PRIVATE'));
  for (const field of Object.keys(before).filter(k => !['careInstructionsVersion','careInstructions','history'].includes(k))) assert.deepEqual(booking[field], before[field]);
  assert.equal(booking.history.length, 1);
  assert.equal(booking.history[0].changedByUserId, 'operator');
  assert.match(booking.history[0].note, /manual legacy review · non-empty/);
  assert(!booking.history[0].note.includes('Feed'));
});
test('explicit empty approval is ready and stale identical replay writes no history', async () => {
  const {booking, save} = await fixture(), operationId = careReviewKey(booking);
  assert.equal((await save(' \n ')).ok, true);
  assert.equal(booking.careInstructions, null);
  assert.equal(booking.careInstructionsVersion, 1);
  assert.match(booking.history[0].note, / · empty$/);
  assert.deepEqual(await save('', {operationId}), {ok: true, replay: true});
  assert.equal(booking.history.length, 1);
});
test('trusted edits stay version one; stale intent and ABA are rejected', async () => {
  const {booking, save} = await fixture();
  await save('A'); const oldKey = careReviewKey(booking);
  await save('B');
  assert.equal((await save('C', {operationId: oldKey})).code, 'CARE_REVIEW_CONFLICT');
  assert.equal(booking.careInstructions, 'B');
  await save('A');
  assert.equal((await save('C', {operationId: oldKey})).code, 'CARE_REVIEW_CONFLICT');
  assert.equal(booking.careInstructionsVersion, 1);
  assert.equal(booking.history.length, 3);
  assert.match(booking.history[1].note, /manual approved-care edit/);
});
for (const actorId of [null, '', 'lead', 'bob', 'unrelated']) test(`denies non-operator actor ${actorId}`, async () => {
  const {booking, save} = await fixture();
  assert.equal((await save('care', {actorId})).ok, false);
  assert.equal(booking.careInstructionsVersion, null); assert.equal(booking.history.length, 0);
});
for (const text of [null, {}, 1, 'x'.repeat(1001)]) test(`rejects invalid care text ${typeof text}`, async () => {
  const {booking, save} = await fixture(); assert.equal((await save(text)).ok, false); assert.equal(booking.history.length, 0);
});
test('unknown formats cannot be downgraded and browser version is ignored', async () => {
  const {booking, save} = await fixture();
  assert.equal((await save('care', {careInstructionsVersion: 20})).ok, true);
  assert.equal(booking.careInstructionsVersion, 1);
  booking.careInstructionsVersion = 2;
  assert.equal((await save('other')).ok, false);
});
test('actual action requires operator, derives actor, allowlists input and refreshes coverage and participants', async () => {
  for (const role of [null, 'SITTER', 'OPERATOR']) {
    let call; const paths = [];
    const loader = surfaceLoader(null, 'operator', {dependencies: {
      '@/auth': {requireRole: async roles => {assert.deepEqual(roles, ['OPERATOR']); if (role !== 'OPERATOR') throw new Error('denied'); return {user:{id:'operator'}}; }},
      'next/cache': {revalidatePath: (...args) => paths.push(args)},
      '@/lib/bookings/careSnapshot/remediation': {approveCareInstructionsWithDb: async args => {call=args; return {ok:true};}},
    }});
    const action = loader.load('app/dashboard/operator/bookings/careActions.js').approveCareInstructions;
    const input = {bookingId:'booking', careInstructions:'care', operationId:'key', actorId:'forged', careInstructionsVersion:2, notes:'unsafe'};
    if (role !== 'OPERATOR') {await assert.rejects(action(input), /denied/); assert.equal(call, undefined); continue;}
    assert.equal((await action(input)).ok, true); assert.equal(call.actorId, 'operator');
    assert.deepEqual(Object.keys(call).sort(), ['actorId','bookingId','careInstructions','db','operationId']);
    assert(paths.some(p => p[0] === '/dashboard/operator/bookings/booking'));
    assert(paths.some(p => p[0] === '/dashboard/sitter' && p[1] === 'layout'));
  }
});
test('actual editor distinguishes source, empty approval and already trusted care', () => {
  const C = surfaceLoader(null, 'operator', {dependencies:{'../bookings/careActions': {approveCareInstructions: async()=>({ok:true})}}}).load('app/dashboard/operator/_components/CareInstructionsReview.jsx').default;
  for (const ready of [false, true]) for (const careInstructions of [null, 'Approved food routine']) {
    const html = renderToStaticMarkup(React.createElement(C, {bookingId:'b', historicalNotes:'PRIVATE source', careInstructions, ready, operationId:'key'}));
    assert.match(html, /Historical booking notes/); assert.match(html, /PRIVATE source/);
    const textarea = html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1];
    assert.equal(textarea, ready ? careInstructions || '' : '');
    assert.match(html, ready ? /Reviewed · care ready/ : /Review required/);
    if (ready && !careInstructions) assert.match(html, /Reviewed: no additional care instructions/);
    assert.match(html, /These instructions may be shown to sitters/);
  }
});
test('approval resolves only care provenance when financial readiness is absent', async () => {
  const {booking, save} = await fixture(); booking.status = 'REQUESTED';
  await save('Safe routine'); assert(coverageRows(booking).every(row => !row.eligible));
  assert.equal(booking.status, 'REQUESTED');
});
test('actual form sends explicit empty approval, guards duplicate clicks and refreshes', async () => {
  let resolveSave, calls=0, refreshes=0, submitted;
  const loader=surfaceLoader(null,'operator',{refresh:()=>{refreshes++;},react:{...React,useState:initial=>[initial,()=>{}],useRef:value=>({current:value})},dependencies:{
    '../bookings/careActions':{approveCareInstructions:args=>{calls++;submitted=args;return new Promise(resolve=>{resolveSave=resolve;});}},
  }});
  const C=loader.load('app/dashboard/operator/_components/CareInstructionsReview.jsx').default;
  const tree=C({bookingId:'booking',historicalNotes:'PRIVATE',ready:false,operationId:'review'});
  function find(node){if(node?.type==='form')return node;for(const child of React.Children.toArray(node?.props?.children)){const result=find(child);if(result)return result;}return null;}
  const form=find(tree),event={preventDefault(){}};
  const pending=form.props.onSubmit(event);await form.props.onSubmit(event);assert.equal(calls,1);
  assert.deepEqual(submitted,{bookingId:'booking',careInstructions:'',operationId:'review'});
  resolveSave({ok:true});await pending;assert.equal(refreshes,1);
});
