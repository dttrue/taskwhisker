import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { participantFixture } from '../careSnapshot/fixtures.js';
import { surfaceLoader } from '../surfaceTestSupport.js';
import { coverageRows, handoffMessage, previewOperatorHandoff } from './operatorSurface.js';
import { participantCareDto } from './participation.js';
import { loadParticipantVisit, loadParticipantDashboard, participantVisitEntry } from './participantSurface.js';

function database(b, userId='bob') {
  const db={user:{findUnique:async()=>({role:'SITTER'})},
    visit:{findFirst:async({where})=>b.visits.some(v=>v.id===where.id && (v.sitterId===userId || b.sitterId===userId))?{bookingId:b.id}:null,
      findMany:async({where})=>{assert.equal(where.sitterId,userId);assert.equal(where.booking.careInstructionsVersion,1);return b.visits.filter(v=>v.sitterId===userId).map(v=>({id:v.id,bookingId:b.id}));}},
    booking:{findFirst:async()=>b},$transaction:async work=>work(db)};
  return db;
}
function nodes(element) { return [element,...React.Children.toArray(element?.props?.children).flatMap(child=>typeof child==='object'?nodes(child):[])]; }
function interaction(ComponentPath,props,actions) {
  let cursor=0;const slots=[];
  const react={...React,useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef:initial=>{const i=cursor++;return slots[i]??=( {current:initial});}};
  let refreshes=0;
  const Component=surfaceLoader(null,'operator',{react,actions,refresh:()=>refreshes++}).load(ComponentPath).default;
  return {render:()=>{cursor=0;return Component(props);}, refreshes:()=>refreshes};
}
test('operator actual JSX: eligible checkboxes, unavailable reasons, sitter roster and care gate',async()=>{
  const b=await participantFixture(); const rows=coverageRows(b);
  assert(rows.every(r=>r.eligible));
  b.visits[0].status='COMPLETED'; b.visits[1].startTime=new Date(0);
  const disabled=coverageRows(b);assert(disabled.every(r=>!r.eligible));assert.equal(disabled[0].reason,'Completed');assert.equal(disabled[1].reason,'Already started');
  const C=surfaceLoader(b).load('app/dashboard/operator/_components/VisitCoverage.jsx').default;
  const html=renderToStaticMarkup(React.createElement(C,{bookingId:b.id,visits:disabled,sitters:[{id:'bob',name:'Bob'}],careReady:true}));
  assert.match(html,/type="checkbox"[^>]*disabled/);assert.match(html,/Scheduled: Bob/);assert.match(html,/Replacement sitter/);
  b.careInstructionsVersion=null;assert(coverageRows(b).every(r=>!r.eligible));
});
test('real picker handlers select multiple visits, choose sitter, prevent double-click, keep retry identity and refresh names',async()=>{
  const b=await participantFixture();const props={bookingId:b.id,visits:coverageRows(b),sitters:[{id:'bob',name:'Bob'}],careReady:true};
  const calls=[];let finish;
  const ui=interaction('app/dashboard/operator/_components/VisitCoverage.jsx',props,{submitVisitHandoff:async input=>{calls.push(input);return new Promise(resolve=>{finish=resolve;});}});
  let tree=ui.render();nodes(tree).filter(n=>n.type==='input')[0].props.onChange({target:{checked:true}});
  tree=ui.render();nodes(tree).filter(n=>n.type==='input')[1].props.onChange({target:{checked:true}});
  tree=ui.render();nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'bob'}});
  tree=ui.render();const submit=nodes(tree).filter(n=>n.type==='button')[1];assert.equal(submit.props.disabled,false);
  const first=submit.props.onClick();await submit.props.onClick();assert.equal(calls.length,1);
  assert.equal(nodes(ui.render()).find(n=>n.type==='fieldset').props.disabled,true);
  finish({ok:false,error:'This sitter is unavailable.'});await first;
  assert.match(renderToStaticMarkup(ui.render()),/This sitter is unavailable/);
  const second=nodes(ui.render()).filter(n=>n.type==='button')[1].props.onClick();assert.equal(calls.length,2);
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].visitIds.length,2);
  finish({ok:true,replay:true,count:2});await second;
  props.visits=props.visits.map(v=>({...v,scheduledSitterName:'Bob'}));
  const html=renderToStaticMarkup(ui.render());assert.match(html,/already saved/);assert.match(html,/2 visits reassigned to Bob/);assert.equal(ui.refreshes(),1);
  assert(nodes(ui.render()).filter(n=>n.type==='input').every(n=>!n.props.checked));
});
test('participant single-Visit loader, discovery and actual page exclude unrelated care/visits/money/actions',async()=>{
  const b=await participantFixture(),db=database(b);
  const dto=await loadParticipantVisit({db,visitId:b.visits[1].id,userId:'bob'});
  assert.equal(dto.visits.length,1);assert.equal(await loadParticipantVisit({db,visitId:b.visits[0].id,userId:'bob'}),null);
  assert.equal(await loadParticipantVisit({db:database(b,'outsider'),visitId:b.visits[1].id,userId:'outsider'}),null);
  const entries=await loadParticipantDashboard({db,userId:'bob'});assert.equal(entries.length,1);assert.equal(entries[0].visit.money.payoutCents,1800);
  const Page=surfaceLoader(b,'bob',{db}).load('app/dashboard/sitter/visits/[visitId]/page.jsx').default;
  const html=renderToStaticMarkup(await Page({params:{visitId:b.visits[1].id}}));
  assert.match(html,/Expected.*\$18\.00/);assert.match(html,/Feeding instructions|Feeding: one bowl/);
  assert.doesNotMatch(html,/PRIVATE|\$22\.50|\$45\.00|Message client|Cancel booking|Reassign|visit-0/);
  const Cards=surfaceLoader(b).load('app/dashboard/sitter/_components/CoverageVisits.jsx').default;
  assert.match(renderToStaticMarkup(React.createElement(Cards,{entries,now:new Date(entries[0].visit.startTime)})),/Coverage visit/);
});
test('coverage routes contain exactly assigned visits; earned payout comes from own allocation',async()=>{
  const b=await participantFixture();const v=b.visits[1],a=v.compensationAuthorizations.at(-1);
  let dto=participantCareDto(b,'bob');
  const {coverageRouteStops}=surfaceLoader(b).load('app/dashboard/sitter/lib/coverageRouteStops.js');
  const entry=participantVisitEntry(dto,dto.visits[0]);
  const stops=coverageRouteStops([entry],new Date(v.startTime));assert.equal(stops.length,1);assert.equal(stops[0].visits.length,1);assert.equal(stops[0].coverageVisitId,v.id);
  v.status='COMPLETED';v.completedAt=new Date();v.performedBySitterId='bob';v.compensationAllocation={...a,authorizationId:a.id,performedBySitterId:'bob'};
  dto=participantCareDto(b,'bob');assert.equal(dto.visits[0].money.status,'EARNED');assert.equal(dto.visits[0].money.payoutCents,1800);
  const Card=surfaceLoader(b).load('app/dashboard/sitter/_components/ParticipantVisit.jsx').ParticipantVisitCard;
  assert.match(renderToStaticMarkup(React.createElement(Card,{entry:participantVisitEntry(dto,dto.visits[0])})),/Earned.*\$18\.00/);
  assert.equal(coverageRouteStops([participantVisitEntry(dto,dto.visits[0])],new Date(v.startTime)).length,0);
});
test('server availability errors are actionable and persistence errors never reveal database details',async()=>{
  assert(!handoffMessage('P2002').includes('P2002'));
  const b=await participantFixture(); const db={user:{findUnique:async({where})=>({role:where.id==='operator'?'OPERATOR':'SITTER'})},booking:{findUnique:async()=>b},visit:{findFirst:async()=>({id:'conflict'})}};
  const result=await previewOperatorHandoff({db,actorId:'operator',input:{bookingId:b.id,visitIds:[b.visits[0].id],sitterId:'replacement'}});
  assert.equal(result.ok,false);assert.match(result.error,/overlapping visit/);
});
for(const actorId of ['sitter','bob']) test(`actual dashboard server loader returns ${actorId === 'sitter' ? 'lead' : 'participant'} own earned amount and bounded coverage entries`,async()=>{
  const b=await participantFixture();
  for(const visit of b.visits){visit.status='COMPLETED';visit.completedAt=new Date();visit.performedBySitterId=visit.sitterId;const a=visit.compensationAuthorizations.at(-1);visit.compensationAllocation={...a,authorizationId:a.id,performedBySitterId:visit.sitterId};}
  const db=database(b,actorId);
  db.booking.findMany=async()=>[];
  db.visit.count=async()=>0;
  db.visit.findMany=async args=>{
    if(args.where.booking.careInstructionsVersion) return actorId==='bob'?[{id:b.visits[1].id,bookingId:b.id}]:[];
    if(args.select?.booking){
      if(args.where.booking.sitterId !== b.sitterId) return [];
      const select=args.select.booking.select;
      assert.equal(select.status,true,'Own earned reader must load booking status for readiness');
      const projected=Object.fromEntries(Object.keys(select).filter(k=>k!=='_count').map(k=>[k,b[k]]));projected._count={visits:b.visits.length};
      return b.visits.filter(v=>v.sitterId===actorId).map(v=>({...v,booking:projected}));
    }
    return [];
  };
  const Page=surfaceLoader(b,actorId,{db}).load('app/dashboard/sitter/page.jsx').default;
  const tree=await Page({searchParams:{}}),live=nodes(tree).find(n=>n.props?.coverageVisitEntries);
  assert(live);assert.equal(live.props.earnedTodayCents,actorId==='sitter'?2250:1800);
  assert.equal(live.props.coverageVisitEntries.length,actorId==='sitter'?0:1);
  assert(!JSON.stringify(live.props.coverageVisitEntries).includes('PRIVATE'));
});
test('actual live dashboard renders participant discovery and own Today route without booking/messaging links',async()=>{
  const b=await participantFixture();const v=b.visits[1];v.startTime=new Date(Date.now()-60000);v.endTime=new Date(Date.now()+1800000);
  const dto=participantCareDto(b,'bob');assert(!dto.unavailable);
  const entry=participantVisitEntry(dto,dto.visits[0]);
  const dependencies={
    'next/navigation':{useRouter:()=>({refresh(){}}),usePathname:()=>'/dashboard/sitter',useSearchParams:()=>new URLSearchParams()},
    'next/dynamic':()=>()=>null,
  };
  const Live=surfaceLoader(b,'bob',{dependencies}).load('app/dashboard/sitter/_components/SitterDashboardLive.jsx').default;
  const html=renderToStaticMarkup(React.createElement(Live,{bookings:[],coverageVisitEntries:[entry]}));
  assert.match(html,/Your coverage visits/);assert.match(html,/Coverage visit details and care instructions/);assert.match(html,/Route Timeline/);
  assert.match(html,/\$18\.00/);assert.doesNotMatch(html,/\$22\.50|\/messages\/booking|\/bookings\/booking/);
});
test('activation wrapper rejects forged care provenance and cannot disable its locked care guard',async()=>{
  const {submitOperatorHandoff}=await import('./operatorSurface.js');
  const b=await participantFixture();b.careInstructionsVersion=null;b.careInstructions=null;
  let writes=0;
  const tx={user:{findUnique:async()=>({role:'OPERATOR'})},$queryRaw:async()=>[],booking:{findUnique:async()=>b},
    visitSitterCompensationAuthorization:{findMany:async()=>[],create:async()=>{writes++;}},visit:{update:async()=>{writes++;}}};
  const result=await submitOperatorHandoff({db:{$transaction:async work=>work(tx)},actorId:'operator',input:{bookingId:b.id,visitIds:[b.visits[0].id],sitterId:'bob',operationId:'attempt',requireCareSnapshot:false,careInstructionsVersion:1,careInstructions:'forged',sitterPayoutCents:1}});
  assert.equal(result.ok,false);assert.match(result.error,/Care instructions need review/);assert.equal(writes,0);
});
