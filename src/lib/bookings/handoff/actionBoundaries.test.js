import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceLoader } from '../surfaceTestSupport.js';
test('actual sitter completion action uses session identity and strips raw financial results',async()=>{
  let call;const paths=[];
  const {completeVisitAsSitter}=surfaceLoader(null,'bob',{dependencies:{
    'next/cache':{revalidatePath:path=>paths.push(path)},
    '@/lib/bookings/economics/completionService':{completeVisitWithDb:async args=>{call=args;return{ok:true,bookingId:'booking',allocation:{sitterPayoutCents:1800,rewardGrantId:'PRIVATE'},financialReview:{reason:'PRIVATE'}};}}
  }}).load('app/dashboard/sitter/actions.js');
  const data=new FormData();data.set('visitId','own-visit');data.set('performerId','forged');
  const result=await completeVisitAsSitter(data);assert.equal(call.actorId,'bob');assert.equal(call.actorRole,'SITTER');assert.equal(call.visitId,'own-visit');assert(!('performerId' in call));
  assert(!JSON.stringify(result).includes('PRIVATE'));assert(!Object.hasOwn(result,'allocation'));assert(paths.includes('/dashboard/sitter/visits/own-visit'));
});
test('actual operator action invokes activation wrapper as authenticated operator',async()=>{
  let call;const {submitVisitHandoff}=surfaceLoader(null,'operator',{dependencies:{
    'next/cache':{revalidatePath(){}},'@/lib/bookings/handoff/operatorSurface':{submitOperatorHandoff:async args=>{call=args;return{ok:true,count:1};}}
  }}).load('app/dashboard/operator/bookings/handoffActions.js');
  const input={bookingId:'booking',visitIds:['visit'],sitterId:'bob',operationId:'key',actorId:'forged'};
  assert.equal((await submitVisitHandoff(input)).ok,true);assert.equal(call.actorId,'operator');assert.equal(call.input,input);
});
test('actual historical messages and whole-booking cancellation remain lead-only',async()=>{
  const booking={id:'booking',sitterId:'lead',status:'CONFIRMED'};
  let writes=0;const db={user:{findUnique:async()=>({id:'bob',role:'SITTER'})},booking:{findUnique:async()=>booking},message:{findFirst:async()=>{writes++;return{id:'request'};}}};
  const dependencies={'@/lib/messaging/getBookingConversation':{getBookingConversation:async()=>({booking,messages:[{body:'PRIVATE'}]})},'@/lib/messaging/readState':{markConversationRead:async()=>{writes++;}},'next/cache':{revalidatePath(){}}};
  const loader=surfaceLoader(booking,'bob',{db,dependencies});
  const Page=loader.load('app/dashboard/sitter/messages/[bookingId]/page.jsx').default;
  await assert.rejects(Page({params:{bookingId:'booking'}}),/Not found/);
  const {approveClientCancellationRequestAsSitter}=loader.load('app/dashboard/sitter/messages/[bookingId]/approveCancellationActions.js');
  assert.equal((await approveClientCancellationRequestAsSitter({bookingId:'booking'})).ok,false);
  const {sendSitterBookingMessage}=loader.load('app/dashboard/sitter/messages/actions.js');
  const data=new FormData();data.set('bookingId','booking');data.set('body','No access');
  await assert.rejects(sendSitterBookingMessage(data),/permission/);assert.equal(writes,0);
});
