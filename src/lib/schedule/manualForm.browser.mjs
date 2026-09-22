// Opt-in, database-free responsive regression. Uses the real compiled CSS and
// JSX; only hook state/framework boundaries are fixtures. Supply an installed
// Playwright module via SCHEDULE_BROWSER_MODULE (no install/download performed).
// Run after build: node src/lib/schedule/manualForm.browser.mjs
import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { surfaceLoader } from "../bookings/surfaceTestSupport.js";
import { calendarRange, aggregateMonth } from "../calendar/calendarRange.js";
import { normalizeManualInput } from "./manualInput.js";
import { manualBookingFailure } from "./manualBookingErrors.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const staticRoot = resolve(root, ".next/static");
const css = readdirSync(staticRoot, { recursive: true }).filter((path) => path.endsWith(".css")).map((path) => readFileSync(resolve(staticRoot, path), "utf8")).join("\n");
assert.ok(css.includes("overflow-wrap:anywhere"), "Build the updated production CSS first");
const modulePath = process.env.SCHEDULE_BROWSER_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const output = process.env.SCHEDULE_VISUAL_OUTPUT ? resolve(process.env.SCHEDULE_VISUAL_OUTPUT) : null;
if (output) {
  assert.ok(relative(root, output).startsWith(".."), "Screenshots must stay outside the repository");
  mkdirSync(output, { recursive: true });
}

function formMarkup(long, reviewed, invalid) {
  const name = long ? "X".repeat(200) : "Synthetic Client";
  const label = (normal) => long ? "Y".repeat(200) : normal;
  const visits = [{ date: "2027-01-05", startTime: "09:00", endTime: "09:30" }, { date: "2027-01-06", startTime: "22:00", endTime: "22:30" }];
  let failure;
  if (invalid) {
    const input = { clientId: "fixture-client", serviceCode: "WALK", schedule: { kind: "TIMED_VISIT", visits } };
    try { normalizeManualInput(input); } catch (error) { failure = manualBookingFailure(error, input); }
  }
  const review = { token: "synthetic", summary: { service: label("Dog walk"), unitPriceCents: 2500, quantity: 1, unit: "visit", extras: [{ code: "EXTRA", name: label("Extra care"), quantity: 2, totalPriceCents: 1600 }], clientTotalCents: 4100, platformFeeCents: 410, sitterPayoutCents: 3690 } };
  const overrides = { 2: "fixture-client", 8: ["fixture-pet"], 9: { EXTRA: 2 }, ...(reviewed ? { 11: review } : {}), ...(invalid ? { 6: visits, 12: failure.error, 14: failure.fieldErrors } : {}) };
  let index = 0;
  const react = { ...React, useState(initial) { const i = index++; return React.useState(Object.hasOwn(overrides, i) ? overrides[i] : initial); } };
  const loader = surfaceLoader(null, "synthetic", { react });
  const Form = loader.load("app/dashboard/schedule/new/ManualBookingForm.jsx").default;
  const { PageShell } = loader.load("components/ui/Foundation.jsx");
  const props = { initialDate: "2027-01-05", sitterName: label("Synthetic Sitter"), clients: [{ id: "fixture-client", name, email: "synthetic@example.invalid", pets: [{ id: "fixture-pet", name: label("Synthetic Pet"), species: "DOG" }] }], services: [{ code: "WALK", name: label("Dog walk"), category: "WALK", durationMinutes: 30, basePriceCents: 2500 }, { code: "EXTRA", name: label("Extra care"), category: "EXTRA", basePriceCents: 800 }] };
  return renderToStaticMarkup(React.createElement(PageShell, { containerClassName: "max-w-2xl" }, React.createElement(Form, props)));
}
function calendarMarkup(date) {
  const range = calendarRange({ date }, new Date("2027-01-05T17:00:00Z"));
  const Calendar = surfaceLoader(null).load("components/calendar/ScheduleCalendar.jsx").default;
  return renderToStaticMarkup(React.createElement(Calendar, { range, monthDays: aggregateMonth(range, []), title: "Synthetic calendar", description: "America/New_York", backHref: "/dashboard", addHref: "/new", basePath: "/calendar" }));
}
const browser = await chromium.launch({ headless: true, ...(process.env.SCHEDULE_BROWSER_EXECUTABLE ? { executablePath: process.env.SCHEDULE_BROWSER_EXECUTABLE } : {}) });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const cases = [
      ["ordinary-form", formMarkup(false, false, false)], ["long-form", formMarkup(true, false, false)],
      ["ordinary-review", formMarkup(false, true, false)], ["long-review", formMarkup(true, true, false)],
      ["field-errors", formMarkup(false, false, true)],
      ["lower-fallback", calendarMarkup("2000-01-01")], ["upper-fallback", calendarMarkup("9999-12-01")],
      ["lower-boundary", calendarMarkup("2000-02-01")], ["upper-boundary", calendarMarkup("9999-11-01")],
    ];
    let ordinaryReviewWidth;
    for (const [name, markup] of cases) {
      await page.setContent(`<html lang="en" data-theme="taskwhisker"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${markup}</body></html>`);
      if (name.endsWith("form")) await page.getByText("Extras (optional)", { exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width, `${name}: horizontal overflow`);
      if (name.endsWith("review")) {
        assert.ok(await page.getByRole("button", { name: /Save Booking/ }).isEnabled());
        const width = (await page.locator('[aria-label="Review booking"] > section').boundingBox()).width;
        if (name === "ordinary-review") ordinaryReviewWidth = width;
        else {
          assert.equal(width, ordinaryReviewWidth, "long names must not expand review cards");
          assert.ok(await page.getByText("X".repeat(200), { exact: false }).isVisible());
          assert.equal(await page.locator('[aria-label="Review booking"] p').evaluateAll((elements) => elements.some((element) => element.scrollWidth > element.clientWidth)), false);
        }
      }
      if (name.endsWith("form")) {
        assert.ok(await page.getByRole("button", { name: "Review booking total" }).isEnabled());
        await page.locator("#client-select").focus();
        await page.keyboard.press("Tab");
      } else if (name === "field-errors") {
        for (const id of ["date-1", "time-1", "end-1"]) {
          assert.equal(await page.locator(`#${id}`).getAttribute("aria-invalid"), "true");
          assert.equal(await page.locator(`#${id}`).getAttribute("aria-describedby"), `${id}-error`);
          assert.ok(await page.locator(`#${id}-error`).isVisible());
        }
        assert.ok(await page.getByRole("alert").isVisible());
        await page.locator("#time-1").focus();
      } else if (name.includes("fallback") || name.includes("boundary")) {
        if (name.includes("fallback")) assert.ok(await page.getByRole("heading", { name: "January 2027" }).isVisible());
        if (name === "lower-boundary") assert.ok(await page.getByRole("button", { name: "Previous month" }).isDisabled());
        if (name === "upper-boundary") assert.ok(await page.getByRole("button", { name: "Next month" }).isDisabled());
        await page.locator("td a").first().focus(); await page.keyboard.press("Tab");
      } else { await page.getByRole("button", { name: /Save Booking/ }).focus(); }
      assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), "solid", `${name}: focus must be visible`);
      if (output) await page.screenshot({ path: resolve(output, `${viewport.width}-${name}.png`), fullPage: true });
      console.log(JSON.stringify({ viewport, case: name, overflow: false, focus: "visible", result: "pass" }));
    }
    await context.close();
  }
} finally { await browser.close(); }
