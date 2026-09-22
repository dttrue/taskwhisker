import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { surfaceLoader } from "../bookings/surfaceTestSupport.js";
import { normalizeManualInput } from "./manualInput.js";
import { manualBookingFailure } from "./manualBookingErrors.js";

// Exercise the real component handlers with persistent hook state and a local
// validation action. DOM measurements live in the opt-in browser fixture test.
function formHarness(overrides = {}) {
  const states = Object.assign([], overrides), inFlight = { current: false };
  let cursor = 0;
  const react = { ...React, useRef: () => inFlight, useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
  } };
  const actions = { reviewManualBooking: async (input) => {
    try { normalizeManualInput(input); return { ok: true, token: "synthetic", summary: { service: "Walk", quantity: 1, unit: "visit", extras: [], unitPriceCents: 2500, clientTotalCents: 2500, platformFeeCents: 250, sitterPayoutCents: 2250 } }; }
    catch (error) { return manualBookingFailure(error, input); }
  } };
  const Form = surfaceLoader(null, "synthetic", { react, actions }).load("app/dashboard/schedule/new/ManualBookingForm.jsx").default;
  const props = { initialDate: "2027-01-05", sitterName: "Synthetic Sitter", clients: [{ id: "client", name: "Synthetic Client", pets: [] }], services: [{ code: "WALK", name: "Walk", category: "WALK", durationMinutes: 30, basePriceCents: 2500 }] };
  function render() { cursor = 0; return Form(props); }
  function find(predicate, node = render()) {
    if (!React.isValidElement(node)) return null;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props.children)) { const found = find(predicate, child); if (found) return found; }
    return null;
  }
  return {
    render, html: () => renderToStaticMarkup(render()),
    change(id, value) { const tree = render(); const field = find((node) => node.props.id === id, tree); assert.ok(field, id); field.props.onChange({ target: { value } }); tree.props.onChange({ target: { id, dataset: {} } }); },
    click(label) { const button = find((node) => node.props.onClick && React.Children.toArray(node.props.children).join("") === label); assert.ok(button, label); return button.props.onClick(); },
    submit: () => render().props.onSubmit({ preventDefault() {} }),
  };
}

test("invalid row controls describe their errors; summary remains announced; correction clears errors", async () => {
  const form = formHarness();
  form.change("client-select", "client"); form.click("Add another visit");
  form.change("time-1", "22:00");
  await form.submit();
  let html = form.html();
  for (const id of ["date-1", "time-1", "end-1"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-describedby="${id}-error"[^>]*aria-invalid="true"`));
    assert.ok(html.includes(`id="${id}-error"`));
  }
  assert.match(html, /id="time-0"[^>]*aria-invalid="false"/);
  assert.ok(html.includes('role="alert"')); assert.ok(html.includes('aria-live="assertive"'));
  form.change("time-1", "10:00");
  assert.ok(!form.html().includes('aria-invalid="true"'));
  await form.submit();
  html = form.html(); assert.ok(html.includes("Review booking")); assert.ok(!html.includes('role="alert"'));
});
test("removing rows remaps errors to the same visit; adding rows preserves existing errors", async () => {
  const form = formHarness(); form.change("client-select", "client"); form.click("Add another visit"); form.change("time-1", "22:00");
  await form.submit(); assert.ok(form.html().includes('aria-invalid="true"'));
  form.click("Remove visit 1");
  assert.ok(form.html().includes('date-0-error')); assert.ok(!form.html().includes('date-1-error'));
  await form.submit(); assert.ok(form.html().includes('date-0-error'));
  form.click("Add another visit"); assert.ok(form.html().includes('date-0-error')); assert.ok(!form.html().includes('date-1-error'));
});
test("contact errors coexist, are field-associated, and stale errors clear on resubmission", async () => {
  const form = formHarness(); form.click("New client"); form.change("client-name", " "); form.change("client-email", "invalid");
  await form.submit(); const html = form.html();
  for (const id of ["client-name", "client-email"]) assert.match(html, new RegExp(`id="${id}"[^>]*aria-describedby="${id}-error"[^>]*aria-invalid="true"`));
  form.change("client-name", "Synthetic Client"); form.change("client-email", "synthetic@example.invalid"); await form.submit();
  assert.ok(!form.html().includes('role="alert"'));
});

test("editing address preserves unrelated contact errors, disclosure and a shrinking announced summary", async () => {
  const form = formHarness(); form.click("New client");
  form.change("client-name", " "); form.change("client-addressLine1", " "); form.change("client-city", " ");
  await form.submit();
  assert.match(form.html(), /<details open=""/);
  form.change("client-addressLine1", "A");
  let html = form.html();
  assert.match(html, /id="client-name"[^>]*aria-describedby="client-name-error"[^>]*aria-invalid="true"/);
  assert.ok(html.includes('client-city-error')); assert.ok(html.includes('role="alert"')); assert.match(html, /<details open=""/);
  assert.ok(!html.includes("Enter a valid street address."));
  form.change("client-name", "Synthetic Client");
  html = form.html(); assert.ok(!html.includes('client-name-error')); assert.ok(html.includes('client-city-error'));
  form.change("client-city", "Synthetic City");
  html = form.html(); assert.ok(!html.includes('role="alert"')); assert.match(html, /<details open=""/);
});
test("general transactional failures survive unrelated edits", () => {
  for (const code of ["SCHEDULE_CONFLICT", "P2002", "P2034", "REVIEW_REQUIRED"]) {
    const result = manualBookingFailure({ code, message: "Existing commitment." }, {});
    const form = formHarness({ 12: result.error });
    form.change("notes", "Synthetic note");
    assert.ok(form.html().includes('role="alert"')); assert.ok(form.html().includes(result.error));
  }
});

test("production recovery helpers preserve independent errors and handle dependent controls", async () => {
  const { recoverFieldErrors, displayFieldErrors, removeVisitErrors } = await import("./manualFormErrors.js");
  const errors = { "client.name": "Name", "client.addressLine1": "Street", clientId: "Client", petIds: "Pets", notes: "Notes", "visits.0.date": "Bad date", "visits.0.startTime": "Interval", "visits.0.endTime": "Interval", "visits.1.startTime": "Other visit", arrivalDate: "Stay range", departureDate: "Stay range" };
  const changed = recoverFieldErrors(errors, "time-0");
  assert.equal(changed["visits.0.date"], "Bad date"); assert.equal(changed["visits.1.startTime"], "Other visit"); assert.equal(changed.notes, "Notes");
  assert.ok(!changed["visits.0.endTime"]);
  assert.deepEqual(recoverFieldErrors({ arrivalDate: "Stay range", departureDate: "Stay range", arrivalTime: "Bad time" }, "arrivalDate"), { arrivalTime: "Bad time" });
  assert.equal(recoverFieldErrors(errors, "client-select")["client.name"], "Name");
  assert.ok(!recoverFieldErrors(errors, "client-select").petIds);
  assert.equal(recoverFieldErrors(errors, "petIds").clientId, "Client");
  assert.equal(recoverFieldErrors(errors, "client-mode").notes, "Notes");
  assert.ok(!recoverFieldErrors(errors, "client-mode")["client.name"]);
  assert.equal(recoverFieldErrors(errors, "service")["visits.0.date"], "Bad date");
  assert.ok(!recoverFieldErrors(errors, "service-overnight")["visits.0.date"]);
  assert.equal(recoverFieldErrors(errors, "service-overnight").arrivalDate, "Stay range");
  assert.deepEqual(recoverFieldErrors({ "visits.0.startTime": "Bad time", "visits.0.endTime": "Bad end" }, "service"), { "visits.0.startTime": "Bad time" });
  assert.deepEqual(recoverFieldErrors({ "visits.0.date": "Interval", "visits.0.startTime": "Interval", "visits.0.endTime": "Interval", notes: "Notes" }, "service"), { notes: "Notes" });
  const extras = displayFieldErrors({ "extras.0.quantity": "First", "extras.1.quantity": "Second" }, [{ code: "A" }, { code: "B" }]);
  assert.deepEqual(recoverFieldErrors(extras, "extra-A"), { "extra:B": "Second" });
  assert.equal(removeVisitErrors(errors, 0)["visits.0.startTime"], "Other visit");
  assert.equal(removeVisitErrors(errors, 1)["visits.0.startTime"], "Interval");
});
