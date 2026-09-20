import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { surfaceLoader } from "../bookings/surfaceTestSupport.js";
import { calendarRange, aggregateMonth } from "../calendar/calendarRange.js";
import { loadAgenda } from "./agenda.js";
import { fixture, ownerConfiguration } from "./fixtures.js";
Object.assign(process.env, ownerConfiguration);
const now = new Date("2027-01-05T17:00:00Z");

test("Month authorizes first, runs one complete-range query, and returns only date aggregates", async () => {
  const { db } = fixture(); let calls = 0, query;
  db.visit.findMany = async (args) => { calls++; query = args; return [{ id: "private-visit-id", status: "CONFIRMED", startTime: new Date("2027-01-01T00:00:00Z"), endTime: new Date("2027-01-01T12:00:00Z"), booking: { client: { name: "SENSITIVE SENTINEL" } } }]; };
  await assert.rejects(() => loadAgenda(db, "outsider", {}, now)); assert.equal(calls, 0);
  const result = await loadAgenda(db, "bridget", {}, now);
  assert.equal(calls, 1);
  assert.deepEqual(query.select, { id: true, startTime: true, endTime: true, status: true });
  assert.equal(query.where.operatorId, "owner"); assert.equal(query.where.sitterId, "bridget");
  assert.deepEqual(query.where.booking, { operatorId: "owner" });
  assert.equal(query.where.startTime.lt.toISOString(), "2027-02-07T05:00:00.000Z");
  assert.equal(query.where.endTime.gt.toISOString(), "2026-12-27T05:00:00.000Z");
  assert.equal(result.visits, undefined);
  assert.ok(!JSON.stringify(result).includes("private-visit-id"));
  assert.ok(!JSON.stringify(result).includes("SENSITIVE"));
  assert.deepEqual(Object.keys(result.monthDays[0]).sort(), ["continuing", "counts", "date", "total"]);
  assert.equal(result.monthDays.find((d) => d.date === "2026-12-31").total, 1);
});

function render(params, visits = []) {
  const range = calendarRange(params, now);
  const Calendar = surfaceLoader(null).load("components/calendar/ScheduleCalendar.jsx").default;
  return renderToStaticMarkup(React.createElement(Calendar, { range, visits, monthDays: aggregateMonth(range, visits), title: "Example calendar", description: "America/New_York", backHref: "/example", addHref: "/example/new", basePath: "/example/calendar" }));
}

test("real Month markup exposes native date navigation, Today, selection, and count labels separately", () => {
  const html = render({ date: "2027-01-06" });
  assert.ok(html.includes("<table")); assert.equal((html.match(/scope="col"/g) || []).length, 7);
  assert.equal((html.match(/Open Day agenda/g) || []).length, 42);
  assert.equal((html.match(/aria-current="date"/g) || []).length, 1);
  assert.equal((html.match(/data-selected="true"/g) || []).length, 1);
  assert.match(html, /Jan 5, 2027\. Today\. 0 visits\. Open Day agenda/);
  assert.match(html, /Jan 6, 2027\. Selected\. 0 visits\. Open Day agenda/);
  assert.ok(html.includes('href="/example/calendar?view=today&amp;date=2026-12-27"'));
  for (const text of ["Month", "Week", "Day", "Today", "Add Booking", "Pending", "Confirmed", "Completed", "Canceled", "No visits scheduled in this calendar range."]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("Bridget")); assert.ok(!html.includes("Block Time")); assert.ok(!html.includes("Availability Settings"));
});

test("Month has no selected date by default and exposes no visit details", () => {
  const html = render({}, [{ id: "secret", status: "PENDING", startTime: new Date("2027-01-05T14:00:00Z"), endTime: new Date("2027-01-05T15:00:00Z"), booking: { client: { name: "SENSITIVE" }, petNames: ["SECRET PET"] } }]);
  assert.ok(!html.includes("data-selected")); assert.ok(html.includes("1 visit. 1 pending"));
  assert.ok(!html.includes("SENSITIVE")); assert.ok(!html.includes("SECRET PET"));
  assert.ok(html.includes("Visit counts do not indicate availability."));
});

test("selected empty Day uses the existing agenda and preserves all navigation actions", () => {
  const html = render({ view: "today", date: "2027-01-06" });
  assert.ok(html.includes("Wed, Jan 6, 2027")); assert.ok(html.includes("No visits scheduled."));
  assert.ok(html.includes("Add Booking")); assert.ok(!html.includes("<table"));
  assert.ok(html.includes('href="/example/calendar?view=month&amp;date=2027-01-06"'));
  assert.ok(html.includes('href="/example/calendar?view=today&amp;date=2027-01-05"'));
});
