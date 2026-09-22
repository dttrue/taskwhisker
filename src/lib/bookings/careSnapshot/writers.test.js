import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceLoader } from '../surfaceTestSupport.js';
for(const notes of [undefined,'','   ','  Feeding: one bowl.\nMedication: as provided.\nRoutine: walk.  ']) test(`actual public action freezes trusted care: ${notes ? 'text/whitespace' : 'empty'}`,async()=>{
  let stored;const noop=async()=>({});
  const db={user:{findFirst:async()=>({id:'operator'})},service:{findUnique:async()=>({id:'service',basePriceCents:2000,name:'Visit',category:'DROP_IN'})},
    client:{upsert:async()=>({id:'client'})},booking:{create:async({data})=>{stored=data;return{id:'booking'};},findUnique:async()=>({...stored,id:'booking',client:{name:'Client',email:'client@example.invalid'},visits:[],lineItems:[]})},
    bookingLineItem:{createMany:noop},visit:{create:noop,findMany:async()=>[]},bookingHistory:{create:noop},$transaction:async work=>work(db)};
  const dependencies={
    './bookingSchemas':{publicBookingSchema:{parse:value=>value}},
    '@/lib/messaging/createSystemMessage':{createSystemMessage:noop},
    '@/lib/calendar/checkAvailability':{checkAvailability:async()=>({valid:true})},
    '@/lib/geocodeAddress':{geocodeAddress:async()=>null},
    '@/lib/email/sendClientBookingConfirmationEmail':{sendClientBookingConfirmationEmail:noop},
    '@/lib/email/sendSitterBookingNotificationEmail':{sendSitterBookingNotificationEmail:noop},
    '@/lib/blocklist/checkBlockedClient':{checkBlockedClient:async()=>({blocked:false})},
    '@/lib/bookings/resolveDefaultPublicBookingSitter':{resolveDefaultPublicBookingSitter:async()=>({id:'sitter'})},
  };
  const {createPublicBooking}=surfaceLoader(null,'client',{db,dependencies}).load('app/book/actions.js');
  const result=await createPublicBooking({client:{name:'Client',email:'client@example.invalid'},pets:[{name:'Milo',species:'Dog'}],serviceCode:'DROP_IN_DOG_30',serviceType:'DROP_IN',mode:'MULTIPLE',dates:['2030-10-01'],startTime:'10:00',endTime:'10:30',notes});
  assert.equal(result.ok,true);assert.equal(stored.careInstructionsVersion,1);assert.equal(stored.careInstructions,notes?.trim()||null);assert.equal(stored.notes,notes||null);
});
