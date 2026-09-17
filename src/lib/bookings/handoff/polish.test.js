import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatPetCareDetails, formatCareServiceLabel } from '../carePresentation.js';
import { participantFixture } from '../careSnapshot/fixtures.js';
import { participantCareDto } from './participation.js';
import { participantVisitEntry } from './participantSurface.js';
import { surfaceLoader } from '../surfaceTestSupport.js';
const render = (C, props) => renderToStaticMarkup(React.createElement(C, props));
const dependencies = {
  'next/navigation': { useRouter: () => ({ refresh() {} }), usePathname: () => '/dashboard/sitter', useSearchParams: () => new URLSearchParams() },
  'next/dynamic': () => () => null,
};
test('pet details allowlist renders size and weight without arbitrary JSON', () => {
  assert.equal(formatPetCareDetails({dogSize:['MEDIUM','MEDIUM'],weightClass:'MEDIUM_26_50',secret:'PRIVATE'}),'Size: Medium · Weight: 26–50 lb');
  for (const details of [null, {}, [], {dogSize:[{}],weightClass:'unknown'}, {internal:'PRIVATE'}, {dogSize:['constructor'],weightClass:'toString'}]) assert.equal(formatPetCareDetails(details),'');
  assert.equal(formatPetCareDetails('Legacy pet care'),'Legacy pet care');
});
test('duration appears once, retaining the complete service and option label', () => {
  for (const suffix of ['30 minutes','30 min','30 mins','30-minute visit']) {
    const label=`Drop-In · Dog ${suffix}`;
    assert.equal(formatCareServiceLabel(label,30),label);
  }
  assert.equal(formatCareServiceLabel('Dog drop-in',30),'Dog drop-in · 30 minutes');
  assert.equal(formatCareServiceLabel('Overnight',null),'Overnight');
  assert.equal(formatCareServiceLabel('130 minutes',30),'130 minutes · 30 minutes');
});
test('lead actual booking page renders structured pet details and retains notes', async () => {
  const b=await participantFixture();Object.assign(b,{petDetails:{dogSize:['MEDIUM'],weightClass:'MEDIUM_26_50'},notes:'Original lead care',lineItems:[],startTime:b.visits[0].startTime,endTime:b.visits.at(-1).endTime});
  b.visits.forEach(v=>{v.date=v.startTime;});
  const Page=surfaceLoader(b).load('app/dashboard/sitter/bookings/[id]/page.jsx').default;
  const html=renderToStaticMarkup(await Page({params:{id:b.id}}));
  assert.match(html,/Size: Medium · Weight: 26–50 lb/);assert.match(html,/Original lead care/);assert.doesNotMatch(html,/\[object Object\]/);
});
test('participant card has compensation hierarchy and a single duration without broadening its data',async()=>{
  const b=await participantFixture(),dto=participantCareDto(b,'bob'),entry=participantVisitEntry(dto,dto.visits[0]);
  entry.service={...entry.service,label:'Drop-In · Dog · 30 minutes',durationMinutes:30};
  const Card=surfaceLoader(b).load('app/dashboard/sitter/_components/ParticipantVisit.jsx').ParticipantVisitCard;
  const html=render(Card,{entry});assert.equal((html.match(/30 minutes/g)||[]).length,1);assert.match(html,/Your compensation/);assert.match(html,/Expected pay: \$18.00/);assert.doesNotMatch(html,/PRIVATE|\$22.50|Message client|Cancel booking/);
});
test('pre-start state is explanatory text, active visit exposes completion, completed has no action',()=>{
  const C=surfaceLoader(null).load('app/dashboard/sitter/_components/ParticipantVisit.jsx').ParticipantCompletion;
  const visit={id:'v',canExecute:true,status:'CONFIRMED',startTime:'2099-09-20T13:00:00Z',endTime:'2099-09-20T13:30:00Z'};
  const html=render(C,{visit});assert.match(html,/Visit starts Sep 20, 9:00 AM ET/);assert.doesNotMatch(html,/<button|<form|Available when visit starts/);
  assert.match(render(C,{visit:{...visit,startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+60000)}}),/Mark visit complete/);
  const done=render(C,{visit:{...visit,canExecute:false,status:'COMPLETED'}});assert.match(done,/This visit is complete/);assert.doesNotMatch(done,/<button/);
});
for(const when of ['today','upcoming']) test(`live dashboard includes bounded coverage in ${when} count and list`,async()=>{
  const b=await participantFixture(),v=b.visits[1];
  if(when==='today'){v.startTime=new Date(Date.now()-60000);v.endTime=new Date(Date.now()+600000);}
  const dto=participantCareDto(b,'bob'),entry=participantVisitEntry(dto,dto.visits[0]);
  const Live=surfaceLoader(b,'bob',{dependencies}).load('app/dashboard/sitter/_components/SitterDashboardLive.jsx').default;
  const html=render(Live,{bookings:[],coverageVisitEntries:[entry]});
  const section=html.split(`id="${when}-visits-content"`)[1].split('</section>')[0];
  assert.match(section,/Milo/);assert.match(section,/\$18.00/);assert.match(section,/\/visits\/visit-1/);assert.doesNotMatch(section,/No upcoming|No remaining|\/bookings\/|\/messages\/|PRIVATE/);
  if(when==='upcoming'){assert.match(html,/1 upcoming visit scheduled/);assert.doesNotMatch(html,/Nothing is scheduled after today/);}
});
