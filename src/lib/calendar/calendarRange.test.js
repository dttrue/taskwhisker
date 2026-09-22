import test from "node:test";
import assert from "node:assert/strict";
import { calendarRange, aggregateMonth, calendarHref } from "./calendarRange.js";
import { businessWallTime, addCalendarDays, dateNumber } from "./businessTime.js";

test("Month defaults to the New York month and distinguishes Today from a selected date", () => {
  const now = new Date("2027-01-01T04:59:00Z");
  const range = calendarRange({}, now);
  assert.equal(range.view, "month"); assert.equal(range.month, "2026-12");
  assert.equal(range.today, "2026-12-31"); assert.equal(range.selectedDate, null);
  assert.equal(calendarRange({}, new Date("2027-01-01T05:00:00Z")).month, "2027-01");
  assert.equal(calendarRange({ date: "2026-12-15" }, now).selectedDate, "2026-12-15");
  assert.equal(calendarRange({ date: "invalid" }, now).selectedDate, null);
});

test("Sunday–Saturday grids include only the weeks required, with leap days and year rollover", () => {
  for (const [date, first, last, count] of [
    ["2026-02-15", "2026-02-01", "2026-02-28", 28],
    ["2028-02-15", "2028-01-30", "2028-03-04", 35],
    ["2027-01-31", "2026-12-27", "2027-02-06", 42],
    ["2026-12-31", "2026-11-29", "2027-01-02", 35],
  ]) {
    const range = calendarRange({ date });
    assert.equal(range.days[0], first); assert.equal(range.days.at(-1), last);
    assert.equal(range.days.length, count);
    assert.equal(new Date(dateNumber(first)).getUTCDay(), 0);
    assert.equal(new Date(dateNumber(last)).getUTCDay(), 6);
    range.days.forEach((day, i) => assert.equal(day, addCalendarDays(first, i)));
  }
  const leap = calendarRange({ date: "2028-02-29" });
  assert.ok(leap.days.includes("2028-02-29"));
  assert.equal(leap.previous, "2028-01-01"); assert.equal(leap.next, "2028-03-01");
  assert.equal(calendarRange({ date: "2026-12-31" }).next, "2027-01-01");
  assert.equal(calendarRange({ date: "2027-01-31" }).previous, "2026-12-01");
});

test("month intervals and Today remain correct across both DST transitions and process timezones", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      for (const [date, delta] of [["2027-03-14", -1], ["2027-11-07", 1]]) {
        const range = calendarRange({ date });
        assert.equal((range.endsAt - range.startsAt) / 3600000, range.days.length * 24 + delta);
        assert.equal(range.startsAt.toISOString(), date.startsWith("2027-03") ? "2027-02-28T05:00:00.000Z" : "2027-10-31T04:00:00.000Z");
      }
      for (const [instant, date] of [["2027-03-14T04:59:00Z", "2027-03-13"], ["2027-03-14T07:01:00Z", "2027-03-14"], ["2027-11-07T05:30:00Z", "2027-11-07"], ["2027-11-07T06:30:00Z", "2027-11-07"]]) {
        assert.equal(calendarRange({}, new Date(instant)).today, date);
      }
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test("overnights aggregate once on each intersecting date/month and preserve all status counts", () => {
  const range = calendarRange({ date: "2027-01-01" });
  const visit = (id, start, end, status) => ({ id, startTime: new Date(start), endTime: new Date(end), status });
  const overnight = visit("night", "2027-01-01T00:00:00Z", "2027-01-02T12:00:00Z", "CONFIRMED");
  const visits = [overnight, overnight, ...["PENDING", "COMPLETED", "CANCELED"].map((status) => visit(status, "2027-01-01T14:00:00Z", "2027-01-01T15:00:00Z", status)),
    visit("midnight", "2027-01-03T04:00:00Z", "2027-01-03T05:00:00Z", "CONFIRMED")];
  const days = aggregateMonth(range, visits);
  const get = (date) => days.find((day) => day.date === date);
  assert.equal(get("2026-12-31").total, 1); assert.equal(get("2026-12-31").continuing, 0);
  assert.deepEqual(get("2027-01-01").counts, { PENDING: 1, CONFIRMED: 1, COMPLETED: 1, CANCELED: 1 });
  assert.equal(get("2027-01-01").total, 4); assert.equal(get("2027-01-01").continuing, 1);
  assert.equal(get("2027-01-02").total, 2); assert.equal(get("2027-01-02").continuing, 1);
  assert.equal(get("2027-01-03").total, 0);
});

test("overnight intersection uses real local midnights on short and long DST days", () => {
  for (const date of ["2027-03-14", "2027-11-07"]) {
    const range = calendarRange({ date });
    const days = aggregateMonth(range, [{ id: "night", status: "CONFIRMED", startTime: businessWallTime(addCalendarDays(date, -1), "23:00"), endTime: businessWallTime(addCalendarDays(date, 1), "00:00") }]);
    assert.equal(days.find((day) => day.date === date).continuing, 1);
    assert.equal(days.find((day) => day.date === addCalendarDays(date, 1)).total, 0);
  }
});

test("empty calendar remains empty, and adjacent date links preserve exact Day selection", () => {
  const range = calendarRange({ date: "2027-01-01" });
  assert.ok(aggregateMonth(range, []).every((day) => day.total === 0 && day.continuing === 0));
  assert.equal(calendarHref("/example/calendar", "today", "2026-12-27"), "/example/calendar?view=today&date=2026-12-27");
  const day = calendarRange({ view: "today", date: "2026-12-27" });
  assert.deepEqual(day.days, ["2026-12-27"]);
});

test("unsupported complete grids reset safely; supported endpoints disable unsafe navigation", () => {
  const now = new Date("2027-01-05T17:00:00Z");
  for (const date of ["2000-01-01", "2000-01-31", "9999-12-01", "9999-12-31", "1999-12-31", "10000-01-01", "0000-01-01", "invalid"]) {
    const range = calendarRange({ view: "month", date }, now);
    assert.equal(range.date, "2027-01-05", date);
    assert.equal(range.selectedDate, null);
    assert.ok(range.days.length <= 42);
    assert.doesNotThrow(() => aggregateMonth(range, []));
  }
  for (const [view, date, direction] of [
    ["month", "2000-02-01", "previous"], ["month", "9999-11-01", "next"],
    ["week", "2000-01-02", "previous"], ["week", "9999-12-19", "next"],
    ["today", "2000-01-01", "previous"], ["today", "9999-12-30", "next"],
  ]) {
    const range = calendarRange({ view, date }, now);
    assert.equal(range.date, date); assert.equal(range[direction], null, `${view} ${date}`);
    assert.ok(range.days.length <= 42);
    for (const day of range.days) assert.doesNotThrow(() => businessWallTime(day, "00:00"));
    assert.doesNotThrow(() => aggregateMonth(range, []));
    const other = direction === "previous" ? "next" : "previous";
    assert.equal(calendarRange({ view, date: range[other] }, now).date, range[other]);
  }
  for (const view of ["month", "week", "today"]) {
    for (const date of ["1999-12-31", "10000-01-01", "9999-12-31"]) {
      assert.doesNotThrow(() => calendarRange({ view, date }, now));
    }
  }
});
