import nextEnv from '@next/env';
import { spawn } from 'node:child_process';
import { readdir, writeFile } from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const mode = process.argv[2] || 'unit';
const { authenticateCanonicalQa } = await import('./canonical-booking-qa.mjs');
async function files(dir) { const result = []; for (const e of await readdir(dir, { withFileTypes: true })) { const path = `${dir}/${e.name}`; if (e.isDirectory()) result.push(...await files(path)); else if (e.name.endsWith('.test.js') && !e.name.includes('.integration.')) result.push(path); } return result; }
async function run(name, args, env = process.env) {
  const result = await new Promise(resolve => { const p = spawn(process.execPath, args, { env }); let out = ''; p.stdout.on('data', b => { out += b; }); p.stderr.on('data', b => { out += b; }); p.on('exit', code => resolve({ code, out })); });
  let safe = result.out;
  for (const [key, value] of Object.entries(process.env)) if (/URL|KEY|TOKEN|SECRET|OWNER.*ID|QA.*ID/.test(key) && value && value.length > 4) safe = safe.split(value).join('[REDACTED]');
  await writeFile(`/tmp/taskwhisker-messaging-${name}.log`, safe, { mode: 0o600 });
  console.log(name, 'exit', result.code, safe.split('\n').filter(l => /^# (tests|pass|fail|skipped)/.test(l)).join(' '));
  return result.code;
}
try {
  if (mode === 'unit') process.exitCode = await run('unit', ['--test', ...await files('src')]);
  else {
    await authenticateCanonicalQa();
    if (mode === 'remaining-regressions') {
      for (const [flag, path] of [['REASSIGNMENT', 'bookings/confirmation/reassignment'], ['CANCELLATION', 'bookings/cancellation/canonicalCancellation'], ['CONFIRMATION', 'bookings/confirmation/confirmation'], ['CANONICAL', 'bookings/canonical/canonicalBooking'], ['REWARD', 'rewards/rewardProgressGrant'], ['REWARD', 'rewards/rewardReservation']]) {
        process.exitCode = await run(path.split('/').at(-1), ['--test', `src/lib/${path}.integration.test.js`], { ...process.env, [`TASKWHISKER_${flag}_QA_TESTS`]: '1' });
        if (process.exitCode) break;
      }
    } else if (mode === 'all-postgres') {
      process.exitCode = await run('postgres', ['--test', 'src/lib/messaging/coverage.integration.test.js'], { ...process.env, TASKWHISKER_MESSAGING_QA_TESTS: '1' });
      if (!process.exitCode) process.exitCode = await run('regressions', ['scripts/run-visit-compensation-regressions.mjs']);
    } else if (mode === 'postgres') process.exitCode = await run('postgres', ['--test', 'src/lib/messaging/coverage.integration.test.js'], { ...process.env, TASKWHISKER_MESSAGING_QA_TESTS: '1' });
    else if (mode === 'regressions') process.exitCode = await run('regressions', ['scripts/run-visit-compensation-regressions.mjs']);
    else throw new Error('Unknown mode');
  }
} catch { console.error('Check failed; database details withheld.'); process.exitCode = 1; }
