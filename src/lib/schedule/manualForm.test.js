import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { surfaceLoader } from "../bookings/surfaceTestSupport.js";
import { normalizeManualInput } from "./manualInput.js";
import { manualBookingFailure } from "./manualBookingErrors.js";

// Exercise the real component handlers with persistent hook state and a local
// validation action. DOM measurements live in the opt-in browser fixture test.
function formHarness() {
  const states = [], inFlight = { current: false };
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
    change(id, value) { const tree = render(); const field = find((node) => node.props.id === id, tree); assert.ok(field, id); field.props.onChange({ target: { value } }); tree.props.onChange(); },
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
test("removing or adding visit rows clears positional errors before indices change", async () => {
  const form = formHarness(); form.change("client-select", "client"); form.click("Add another visit"); form.change("time-1", "22:00");
  await form.submit(); assert.ok(form.html().includes('aria-invalid="true"'));
  form.click("Remove visit 1");
  assert.ok(!form.html().includes('aria-invalid="true"')); assert.ok(!form.html().includes('date-1-error'));
  await form.submit(); assert.ok(form.html().includes('date-0-error'));
  form.click("Add another visit"); assert.ok(!form.html().includes('aria-invalid="true"'));
});
test("contact errors coexist, are field-associated, and stale errors clear on resubmission", async () => {
  const form = formHarness(); form.click("New client"); form.change("client-name", " "); form.change("client-email", "invalid");
  await form.submit(); const html = form.html();
  for (const id of ["client-name", "client-email"]) assert.match(html, new RegExp(`id="${id}"[^>]*aria-describedby="${id}-error"[^>]*aria-invalid="true"`));
  form.change("client-name", "Synthetic Client"); form.change("client-email", "synthetic@example.invalid"); await form.submit();
  assert.ok(!form.html().includes('role="alert"'));
});
