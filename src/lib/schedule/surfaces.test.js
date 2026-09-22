import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { surfaceLoader } from '../bookings/surfaceTestSupport.js';
import { agendaRange } from './agenda.js';

export function scheduleSurface() {
  const range = agendaRange({ view: 'week', date: '2027-01-05' });
  const visits = [
    { id: 'night', bookingId: 'overnight', status: 'CONFIRMED', startTime: new Date('2027-01-04T00:00:00Z'), endTime: new Date('2027-01-04T12:00:00Z'), sitter: { name: 'Bridget' }, booking: { client: { name: 'Morgan Lee' }, serviceSummary: 'Overnight care', petNames: [], bookingPets: [{ nameSnapshot: 'Luna' }] } },
    { id: 'walk', bookingId: 'walk', status: 'CONFIRMED', startTime: new Date('2027-01-05T14:00:00Z'), endTime: new Date('2027-01-05T14:30:00Z'), sitter: { name: 'Bridget' }, booking: { client: { name: 'Alex Rivera' }, serviceSummary: 'Dog walk · 30 minutes', petNames: [], bookingPets: [{ nameSnapshot: 'Milo' }] } },
  ];
  return surfaceLoader(null, 'owner', { dependencies: {
    '@/auth': { requireAuth: async () => ({ user: { id: 'owner' } }) },
    '@/lib/schedule/agenda': { loadAgenda: async () => ({ access: { role: 'OPERATOR' }, range, visits }) },
  } }).load('app/dashboard/schedule/page.jsx').default;
}
export function formSurface(review = null) {
  let stateIndex = 0;
  const react = review ? { ...React, useState(initial) {
    const index = stateIndex++;
    return React.useState(index === 2 ? 'client' : index === 11 ? review : initial);
  } } : undefined;
  return surfaceLoader(null, 'owner', { react }).load('app/dashboard/schedule/new/ManualBookingForm.jsx').default;
}
export const formProps = { clients: [{ id: 'client', name: 'Alex Rivera', email: 'alex@example.invalid', pets: [{ id: 'milo', name: 'Milo', species: 'DOG' }] }], sitterName: 'Bridget', initialDate: '2027-01-05', services: [
  { code: 'WALK', name: 'Dog walk · 30 minutes', category: 'WALK', durationMinutes: 30, basePriceCents: 2500 },
  { code: 'STAY', name: 'Overnight care', category: 'OVERNIGHT', basePriceCents: 6000 },
  { code: 'EXTRA', name: 'Additional pet', category: 'EXTRA', basePriceCents: 800 },
] };

test('week agenda renders real cards, local times, empty days, pet snapshots and navigation', async () => {
  const Page = scheduleSurface();
  const html = renderToStaticMarkup(await Page({ searchParams: {} }));
  for (const text of ['Bridget’s schedule', 'Alex Rivera', 'Milo', '9:00 AM', 'Morgan Lee', 'Luna', 'No visits scheduled.', 'America/New_York', 'Add Booking']) assert.ok(html.includes(text), text);
  assert.equal((html.match(/Morgan Lee/g) || []).length, 2, 'overnight appears on both calendar days');
  assert.ok(html.includes('>Month</a>'));
  assert.ok(html.includes('>Today</a>'));
  assert.ok(html.includes('view=week&amp;date=2027-01-10'));
});
test('manual form renders mobile-sized controls, optional pets and review-before-save', () => {
  const html = renderToStaticMarkup(React.createElement(formSurface(), formProps));
  for (const text of ['Existing client', 'New client', 'Review booking total', 'Add another visit', 'Care notes (optional)']) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!html.includes('Save Booking'));
  assert.ok(html.includes('type="date"')); assert.ok(html.includes('type="time"'));
});

test('final save only appears with the server-reviewed total, split, and details', () => {
  const review = { token: 'test-review', summary: { service: 'Dog walk', unitPriceCents: 2500, quantity: 2, unit: 'visit', clientTotalCents: 5000, platformFeeCents: 500, sitterPayoutCents: 4500, extras: [] } };
  const html = renderToStaticMarkup(React.createElement(formSurface(review), formProps));
  for (const text of ['Booking total: $50.00', 'Save Booking · $50.00', '$5.00', '$45.00', 'Alex Rivera', 'Edit details']) assert.ok(html.includes(text), text);
});


test('Week marks only the New York current date, including empty days, DST and week boundaries', async () => {
  const original = process.env.TZ;
  const cases = [
    ['2027-03-14T04:59:00Z', '2027-03-13'], // Still Saturday in New York.
    ['2027-03-14T05:00:00Z', '2027-03-14'], // Sunday starts a new week.
    ['2027-03-14T07:01:00Z', '2027-03-14'], // Spring DST jump.
    ['2027-11-07T05:30:00Z', '2027-11-07'], // First fall 01:30.
    ['2027-11-07T06:30:00Z', '2027-11-07'], // Repeated fall 01:30.
    ['2028-01-01T02:00:00Z', '2027-12-31'],
  ];
  try {
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      for (const [instant, expected] of cases) {
        const range = agendaRange({ view: 'week' }, new Date(instant));
        assert.equal(range.today, expected);
        const Page = surfaceLoader(null, 'owner', { dependencies: {
          '@/auth': { requireAuth: async () => ({ user: { id: 'owner' } }) },
          '@/lib/schedule/agenda': { loadAgenda: async () => ({ access: { role: 'OPERATOR' }, range, visits: [] }) },
        } }).load('app/dashboard/schedule/page.jsx').default;
        const html = renderToStaticMarkup(await Page({ searchParams: {} }));
        assert.equal((html.match(/aria-current="date"/g) || []).length, 1);
        assert.ok(html.includes(`aria-labelledby="day-${expected}" aria-current="date"`));
        assert.equal((html.match(/>Today<\/span>/g) || []).length, 1);
        assert.equal((html.match(/No visits scheduled./g) || []).length, 7);
      }
    }
    const range = agendaRange({ view: 'week', date: '2027-01-03' }, new Date('2027-01-20T12:00:00Z'));
    assert.ok(!range.days.includes(range.today), 'an old week must not mark its navigated date as Today');
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});
