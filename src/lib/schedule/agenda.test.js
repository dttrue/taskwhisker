import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaRange, loadAgenda } from './agenda.js';
import { businessWallTime, businessDateKey, addCalendarDays } from '../calendar/businessTime.js';
import { fixture, ownerConfiguration } from './fixtures.js';
Object.assign(process.env, ownerConfiguration);

test('Today uses New Jersey date before and after UTC midnight', () => {
  assert.equal(agendaRange({}, new Date('2027-01-06T02:00:00Z')).date, '2027-01-05');
  assert.equal(agendaRange({}, new Date('2027-01-06T05:00:00Z')).date, '2027-01-06');
});
test('DST days are 23 or 25 hours and week navigation uses calendar days', () => {
  const spring = agendaRange({ date: '2027-03-14', view: 'today' });
  const fall = agendaRange({ date: '2027-11-07', view: 'today' });
  assert.equal(spring.endsAt - spring.startsAt, 23 * 3600000);
  assert.equal(fall.endsAt - fall.startsAt, 25 * 3600000);
  const week = agendaRange({ date: '2027-03-17', view: 'week' });
  assert.equal(week.days[0], '2027-03-14'); assert.equal(week.days[6], '2027-03-20');
  assert.equal(week.previous, '2027-03-07'); assert.equal(week.next, '2027-03-21');
});
test('invalid links reset reliably and Today needs no persisted date', () => {
  const now = new Date('2027-01-01T12:00:00Z');
  for (const date of ['bad', '2027-02-30', ['2027-01-01'], null]) assert.equal(agendaRange({ date }, now).date, '2027-01-01');
  assert.equal(agendaRange({ view: 'unknown' }, now).view, 'month');
});
test('wall-time conversion rejects nonexistent/ambiguous instants', () => {
  for (const [date, time] of [['2027-03-14', '02:30'], ['2027-11-07', '01:30']]) assert.throws(() => businessWallTime(date, time), (error) => error.code === 'INVALID_LOCAL_TIME');
  assert.equal(businessWallTime('2027-01-05', '09:00').toISOString(), '2027-01-05T14:00:00.000Z');
  assert.equal(businessWallTime('2027-07-05', '09:00').toISOString(), '2027-07-05T13:00:00.000Z');
  assert.equal(addCalendarDays('2027-12-31', 1), '2028-01-01');
  assert.equal(businessDateKey(new Date('2027-01-01T04:59:00Z')), '2026-12-31');
});
test('agenda authorizes first and queries actual assigned visits across date boundaries', async () => {
  const { db } = fixture(); let query;
  db.visit.findMany = async (args) => { query = args; return []; };
  await assert.rejects(() => loadAgenda(db, 'outsider', {})); assert.equal(query, undefined);
  const result = await loadAgenda(db, 'bridget', { date: '2027-01-05', view: 'week' });
  assert.equal(query.where.operatorId, 'owner'); assert.equal(query.where.sitterId, 'bridget');
  assert.equal(query.where.booking.operatorId, 'owner');
  assert.equal(query.where.startTime.lt, result.range.endsAt);
  assert.equal(query.where.endTime.gt, result.range.startsAt);
  assert.deepEqual(query.orderBy, [{ startTime: 'asc' }, { id: 'asc' }]);
});
