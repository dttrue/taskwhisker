import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import swc from "next/dist/build/swc/index.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import * as economics from "../economics/bookingEconomics.js";
import { calculateCancellationFeeCents } from "../cancelBookingTransaction.js";

await swc.loadBindings();
const require = createRequire(import.meta.url);
const src = new URL("../../../", import.meta.url);
function compile(path, dependency) {
  const { code } = swc.transformSync(readFileSync(new URL(path, src), "utf8"), {
    filename: path, jsc: { target: "es2022", parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" },
  });
  const evaluated = { exports: {} }; new Function("require", "module", "exports", code)(dependency, evaluated, evaluated.exports); return evaluated.exports;
}
const sitterPath = "app/dashboard/sitter/messages/[bookingId]/approveCancellationActions.js";
const operatorPath = "app/dashboard/operator/bookings/actions.js";
for (const route of ["operator direct", "operator approval", "sitter approval", "sitter waiver"]) for (const canonical of [true, false]) test(`${route}: actual action dispatch for ${canonical ? "canonical" : "legacy"}`, async () => {
  const sitter = route.startsWith("sitter"), id = sitter ? "sitter" : "operator", calls = [], paths = [];
  const booking = { id: "booking", sitterId: "sitter", status: "CONFIRMED", clientLinkToken: "token",
    ...(canonical ? { canonicalCreationKey: "frozen", clientTotalCents: null, platformFeeCents: null, sitterPayoutCents: null } : { clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250 }) };
  const db = { booking: { findUnique: async () => booking }, user: { findUnique: async () => ({ id, role: sitter ? "SITTER" : "OPERATOR" }) }, message: { findFirst: async () => ({ id: "request" }) }, $transaction: async (work) => work({}) };
  const canonicalResult = { ok: true, status: "CANCELED", reasonCode: "CANONICAL_CANCELLATION_REQUIRES_REVIEW", financialReviewRequired: true, message: "Review required", clientLinkToken: "token" };
  const actions = compile(sitter ? sitterPath : operatorPath, (name) => {
    if (name === "@/lib/db") return { prisma: db };
    if (name === "@/auth") return { auth: async () => ({ user: { email: "qa@example.invalid" } }), requireRole: async () => ({ user: { id } }) };
    if (name === "next/cache") return { revalidatePath: (path) => paths.push(path) };
    if (name === "next/navigation") return {};
    if (name.endsWith("economics/bookingEconomics")) return economics;
    if (name.endsWith("cancellation/canonicalCancellation")) return { cancelCanonicalBookingWithDb: async (args) => { calls.push({ canonical: args }); return canonicalResult; } };
    if (name.endsWith("cancelBookingTransaction")) return { CLIENT_CANCELLATION_FEE_RATE_BPS: 1500,
      calculateCancellationFeeCents: (amount) => { assert.equal(canonical, false, "Canonical must never enter fee math"); return calculateCancellationFeeCents(amount); },
      cancelBookingTransaction: async (args) => { assert.equal(canonical, false); calls.push({ legacy: args }); return { ok: true, clientLinkToken: "token" }; } };
    if (name.includes("completionService") || name.includes("confirmationService")) return {};
    throw new Error(`Unexpected dependency ${name}`);
  });
  const form = new FormData(); form.set("bookingId", "booking"); form.set("cancelReason", "Plans changed");
  const result = sitter ? await actions.approveClientCancellationRequestAsSitter({ bookingId: "booking", waiveCancellationFee: route.endsWith("waiver") })
    : await actions[route.endsWith("direct") ? "cancelBooking" : "approveClientCancellationRequest"](form);
  assert.equal(result.ok, true); assert.equal(calls.length, 1);
  if (canonical) { assert.deepEqual(result, canonicalResult); assert.equal(calls[0].canonical.actorId, id); assert.equal(calls[0].canonical.bookingId, "booking"); if (sitter) assert.equal(calls[0].canonical.waiveFee, route.endsWith("waiver")); }
  else { const waived = route.endsWith("direct") || route.endsWith("waiver"); assert.equal(calls[0].legacy.cancellationFeeCents, waived ? 0 : 413); assert.equal(calls[0].legacy.cancellationFeeWaived, waived); }
  assert(paths.includes("/client/bookings/token"));
});
for (const canonical of [true, false]) test(`sitter approval actual JSX: ${canonical ? "review without fee claims" : "legacy fee and waiver preserved"}`, () => {
  const Component = compile("app/dashboard/sitter/messages/[bookingId]/ApproveCancellationRequestButton.jsx", (name) => name === "./approveCancellationActions" ? {} : require(name)).default;
  const html = renderToStaticMarkup(React.createElement(Component, { bookingId: "booking", canonical }));
  if (canonical) { assert.match(html, /manual review/); assert.doesNotMatch(html, /15%|Waive cancellation fee|\$0/); }
  else { assert.match(html, /15%/); assert.match(html, /Waive cancellation fee/); }
});
