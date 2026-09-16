import "dotenv/config";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { authenticateCanonicalQa } from "./canonical-booking-qa.mjs";
await authenticateCanonicalQa().catch(()=>{console.error("QA authentication failed; no tests started.");process.exit(1);});
const suites=[
 ["HANDOFF","bookings/handoff/handoff"],
 ["VISIT_COMPENSATION","bookings/visitCompensation/visitCompensation"],
 ["COMPENSATION","bookings/compensation/bookingSitterCompensation"],
 ["READERS","bookings/economics/bookingEconomics"],
 ["REASSIGNMENT","bookings/confirmation/reassignment"],
 ["CANCELLATION","bookings/cancellation/canonicalCancellation"],
 ["CONFIRMATION","bookings/confirmation/confirmation"],
 ["CANONICAL","bookings/canonical/canonicalBooking"],
 ["REWARD","rewards/rewardProgressGrant"],
 ["REWARD_RESERVATION","rewards/rewardReservation"],
];
const only=process.argv[2];
for(const [flag,path] of suites){
 if(only && flag!==only)continue;
 const env={...process.env,[`TASKWHISKER_${flag === "REWARD_RESERVATION" ? "REWARD" : flag}_QA_TESTS`]:'1'};
 const result=await new Promise(resolve=>{const p=spawn(process.execPath,['--test',`src/lib/${path}.integration.test.js`],{env});let out='';p.stdout.on('data',b=>{out+=b; for(const line of b.toString().split('\n')) if (/^    # Subtest:/.test(line)) console.log(flag, line.trim());});p.stderr.on('data',b=>out+=b);p.on('exit',code=>resolve({code,out}));});
 let safe=result.out;
 for(const [k,v]of Object.entries(process.env))if(/URL|KEY|TOKEN|SECRET|OWNER.*ID|QA.*ID/.test(k)&&v&&v.length>4)safe=safe.split(v).join('[REDACTED]');
 await writeFile(`/tmp/taskwhisker-pg-${flag}.log`,safe,{mode:0o600});
 console.log(flag, 'exit',result.code, safe.split('\n').filter(l=>/^# (tests|pass|fail|skipped)/.test(l)).join(' '));
 if(result.code!==0){process.exitCode=1;break;}
}
