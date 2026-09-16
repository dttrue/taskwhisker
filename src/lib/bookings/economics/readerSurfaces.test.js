import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";
import { compensationFixture } from "../compensation/fixtures.js";

// Render the real JSX and helpers with the project's compiler. Only framework
// boundaries (auth, database, navigation and write actions) are substituted.
const require = createRequire(import.meta.url);
const src = fileURLToPath(new URL("../../../", import.meta.url));
await swc.loadBindings();
function surfaceLoader(booking, actorId = "sitter") {
  const cache = new Map();
  const queries = [];
  const db = {
    booking: {
      async findUnique(args) { queries.push(args); return booking; },
      async findMany() { return []; },
      async findFirst() { return null; },
    },
    user: { async findUnique() { return { id: "sitter", role: "SITTER" }; }, async findMany() { return []; } },
  };
  const actions = new Proxy({}, { get: () => async () => ({ ok: true }) });
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const evaluatedModule = { exports: {} }; cache.set(path, evaluatedModule);
    const { code } = swc.transformSync(readFileSync(path, "utf8"), {
      filename: path,
      jsc: { target: "es2022", parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
      module: { type: "commonjs" },
    });
    function dependency(name) {
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
      if (name === "next/navigation") return { notFound() { throw new Error("Not found"); }, useRouter: () => ({ refresh() {} }), usePathname: () => "/dashboard/sitter" };
      if (name === "@/auth" || name === "@/lib/auth") return { requireRole: async () => ({ user: { id: actorId, email: "sitter@example.invalid" } }), auth: async () => ({ user: { id: actorId } }) };
      if (name === "@/lib/db") return { prisma: db };
      if (/actions(?:\.js)?$/.test(name) || /approveCancellationActions$/.test(name)) return actions;
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? resolve(src, name.slice(2)) : resolve(dirname(path), name);
        const target = [base, `${base}.js`, `${base}.jsx`].find((p) => existsSync(p));
        if (!target) throw new Error(`Unresolved test dependency: ${name}`);
        return load(target);
      }
      return require(name);
    }
    new Function("require", "module", "exports", code)(dependency, evaluatedModule, evaluatedModule.exports);
    return evaluatedModule.exports;
  }
  return { load: (path) => load(resolve(src, path)), queries };
}
async function bookingFixture(kind) {
  const f = compensationFixture({ reward: kind === "reward" ? "RESERVED" : null });
  if (["committed", "reward"].includes(kind)) await f.commit();
  const b = { ...f.state.booking, rewardReservation: f.state.reservation,
    client: { name: "Client" }, sitter: { id: "sitter", name: "Sitter" }, petNames: ["Milo"], serviceSummary: "Pet care",
    startTime: f.state.booking.visits[0].startTime, endTime: f.state.booking.visits[0].endTime, history: [], lineItems: [], clientLinkToken: "client-token" };
  for (const v of b.visits) v.date = v.startTime;
  if (kind === "legacy") {
    for (const key of ["pricingSnapshot", "sitterCompensation", "canonicalCreationKey", "canonicalInputHash", "careOptionId", "careOfferingId", "careOptionCode", "careOfferingCode", "quantity", "billingUnit", "scheduleKind"]) b[key] = null;
    Object.assign(b, { clientTotalCents: 2750, platformFeeCents: 500, sitterPayoutCents: 2250 });
  }
  return b;
}
test("Visit participant does not gain lead booking financial/history access", async () => {
  const booking = await bookingFixture("committed");
  booking.visits[0].sitterId = "participant";
  const Component = surfaceLoader(booking, "participant").load("app/dashboard/sitter/bookings/[id]/page.jsx").default;
  await assert.rejects(Component({ params: { id: booking.id } }), /Not found/);
});
for (const [name, path, props, amount, pending] of [
  ["operator table", "app/dashboard/operator/_components/BookingsTable.jsx", (b) => ({ bookings: [b] }), "$27.50", false],
  ["sitter table", "app/dashboard/sitter/_components/BookingTable.jsx", (b) => ({ bookings: [b] }), "$22.50", true],
  ["sitter card", "app/dashboard/sitter/_components/BookingCard.jsx", (b) => ({ booking: b }), "$22.50", true],
  ["client detail", "app/client/bookings/[clientLinkToken]/page.jsx", () => ({ params: { clientLinkToken: "client-token" } }), "$27.50", false],
  ["sitter detail", "app/dashboard/sitter/bookings/[id]/page.jsx", (b) => ({ params: { id: b.id } }), "$22.50", true],
  ["operator detail", "app/dashboard/operator/bookings/[id]/page.jsx", (b) => ({ params: { id: b.id }, searchParams: {} }), "$27.50", true],
]) {
  for (const kind of ["legacy", "pending", "committed", "reward"]) test(`${name} renders real JSX for ${kind} economics`, async () => {
    const b = await bookingFixture(kind), loader = surfaceLoader(b);
    const Component = loader.load(path).default;
    const html = renderToStaticMarkup(await Component({ confirmBooking: async () => ({ ok: true }), completeBooking: async () => ({ ok: true }), cancelBooking: async () => ({ ok: true }), ...props(b) }));
    const expected = kind === "pending" && name === "sitter detail" ? "Unavailable for service" : kind === "pending" && pending ? "Pending" : kind === "reward" && amount === "$22.50" ? "$23.75" : amount;
    assert(html.includes(expected), `Expected ${expected} in ${name}`);
    assert(!html.includes("$0.00"), "Missing legacy money must not render as zero");
    for (const query of loader.queries) {
      assert(query.include.pricingSnapshot); assert(query.include.sitterCompensation);
    }
  });
}
test("actual dashboard utilities preserve legacy estimates and flag mixed canonical allocation", async () => {
  const old = await bookingFixture("legacy"), pending = await bookingFixture("pending");
  const { load } = surfaceLoader(old);
  const sitter = load("app/dashboard/sitter/lib/sitterDashboardUtils.js");
  const operator = load("app/dashboard/operator/lib/dashboardUtils.js");
  const now = new Date("2030-09-12T13:10:00Z");
  assert.equal(sitter.getRemainingPayoutForToday([old], now), 2250);
  assert.equal(sitter.getRemainingPayoutForToday([old, pending], now), null);
  assert.equal(operator.getConfirmedRevenue([old, pending]), 5500);
  assert.equal(sitter.getVisitEntries([pending])[0].payoutStatus, "PENDING");
});

test("pending before care is neutral; finished operations expose manual review in operator detail", async () => {
  const b = await bookingFixture("pending");
  async function html() {
    const Page = surfaceLoader(b).load("app/dashboard/operator/bookings/[id]/page.jsx").default;
    return renderToStaticMarkup(await Page({ params: { id: b.id }, searchParams: {} }));
  }
  assert(!(await html()).includes("Valid sitter compensation is required for booking completion."));
  b.visits[0].status = "COMPLETED";
  assert((await html()).includes("Valid sitter compensation is required for booking completion."));
});

for (const kind of ["pending", "committed", "reward"]) for (const [name, path, props] of [
  ["client", "app/client/bookings/[clientLinkToken]/page.jsx", { params: { clientLinkToken: "client-token" } }],
  ["sitter", "app/dashboard/sitter/bookings/[id]/page.jsx", { params: { id: "booking" } }],
  ["operator", "app/dashboard/operator/bookings/[id]/page.jsx", { params: { id: "booking" }, searchParams: {} }],
]) test(`${name} canceled canonical ${kind}: manual review without invented financial decision`, async () => {
  const b = await bookingFixture(kind); b.status = "CANCELED"; b.canceledAt = new Date();
  b.visits.forEach((v) => { v.status = "CANCELED"; });
  // Even misleading legacy defaults/review metadata cannot authorize a fee.
  b.cancellationFeeCents = 0; b.cancellationFeeWaived = true; b.cancellationFeeReviewedAt = new Date();
  const Page = surfaceLoader(b).load(path).default;
  const html = renderToStaticMarkup(await Page(props));
  assert.match(html, /manual review/i); assert.doesNotMatch(html, /\$0\.00|fee was waived|payout is not active/);
  if (name === "client") assert.doesNotMatch(html, /sitter payable|committed compensation/i);
});

for (const kind of ["pending", "committed"]) test(`operator reassignment form exposes the commitment guard for ${kind} compensation`, async () => {
  const b = await bookingFixture(kind), loader = surfaceLoader(b);
  const Page = loader.load("app/dashboard/operator/bookings/[id]/page.jsx").default;
  const html = renderToStaticMarkup(await Page({ params: { id: b.id }, searchParams: {} }));
  const message = "Compensation is already committed. This reassignment requires review.";
  assert.equal(html.includes(message), kind === "committed");
  if (kind === "committed") assert.match(html, /<select[^>]*name="sitterId"[^>]*disabled/);
});


test("split route projection preserves original-commitment label", async () => {
  const booking = await bookingFixture("committed");
  Object.assign(booking, { hasVisitHandoff: true, serviceLat: 40, serviceLng: -74 });
  const loader = surfaceLoader(booking);
  const { getSitterMapBookings } = loader.load("app/dashboard/sitter/lib/sitterDashboardUtils.js");
  const { sitterPayoutDisplay } = loader.load("lib/bookings/economics/bookingEconomics.js");
  const [projected] = getSitterMapBookings([booking], booking.visits[0].startTime);
  assert.equal(projected.hasVisitHandoff, true);
  assert.match(sitterPayoutDisplay(projected), /^Original commitment: /);
});

async function splitLeadFixture() {
  const f = compensationFixture({ quantity: 2 }); await f.commit();
  const booking = { ...f.state.booking, rewardReservation: null, client: { name: "Client" }, sitter: { id: "sitter", name: "Bridget" },
    serviceSummary: "Pet care", petNames: ["Milo"], history: [], lineItems: [], serviceLat: 40, serviceLng: -74, hasVisitHandoff: true };
  for (const v of booking.visits) { v.date = v.startTime = new Date(Date.now()-1000); v.endTime = new Date(Date.now()+3600000); v.sitter={id:v.sitterId,name:"Bridget"}; }
  const visit=booking.visits[1], original=visit.compensationAuthorizations[0];
  visit.sitterId="bob";visit.sitter={id:"bob",name:"Bob"};
  visit.compensationAuthorizations.push({...original,id:"replacement-auth",revision:2,predecessorId:original.id,sitterId:"bob",compensationLane:"BUSINESS_ASSIGNED",rateSource:"DEFAULT_RATE",sourceRateId:"replacement-rate",rateVersion:1,
    sitterBaseCents:2000,sitterPetCents:0,sitterCompensationSubtotalCents:2000,sitterFeeCents:200,sitterPayoutCents:1800,reason:"handoff",operationId:"handoff"});
  return booking;
}
test("lead detail renders full split schedule and replacement identity without replacement execution or money", async()=>{
  const booking=await splitLeadFixture(),loader=surfaceLoader(booking);
  const Component=loader.load("app/dashboard/sitter/bookings/[id]/page.jsx").default;
  const html=renderToStaticMarkup(await Component({params:{id:booking.id}}));
  for(const v of booking.visits)assert(html.includes(v.id));
  assert.match(html,/Scheduled sitter:.*Bob/);assert.match(html,/value="visit-0"/);assert(!html.includes('value="visit-1"'));
  assert(!html.includes("$18.00"));assert.match(html,/Original commitment/);
});
test("lead dashboard projection keeps full context while route actions, lists and earnings remain own",async()=>{
  const booking=await splitLeadFixture(),loader=surfaceLoader(booking);
  const {leadVisibleVisits}=loader.load("lib/bookings/handoff/participation.js");
  const utils=loader.load("app/dashboard/sitter/lib/sitterDashboardUtils.js");
  const projected={...booking,visits:leadVisibleVisits(booking,"sitter")},now=new Date();
  const [map]=utils.getSitterMapBookings([projected],now);
  assert.equal(map.visits.length,2);assert.equal(map.visits[1].scheduledSitterName,"Bob");assert.equal(map.visits[1].ownMoney,null);
  assert.equal(utils.getActionableVisitForBooking(map,now).id,"visit-0");assert.equal(utils.canCompleteVisit(map.visits[1],now),false);
  assert.deepEqual(utils.getVisitEntries([projected]).map(v=>v.id),["visit-0"]);
  assert.equal(utils.getRemainingPayoutForToday([projected],now),2250);
  const onlyReplacement={...projected,visits:projected.visits.slice(1)};
  assert.equal(utils.getRemainingPayoutForToday([onlyReplacement],now),0);assert.equal(utils.getActionableVisitForBooking(onlyReplacement,now),null);
});
