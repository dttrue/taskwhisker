import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import swc from "next/dist/build/swc/index.js";
import * as jsxRuntime from "react/jsx-runtime";
import * as contract from "./businessOwnerIdentityContract.js";
import { ownerConfiguration, ownerFixtureUser } from "./ownerIdentityFixtures.js";
import { recordQualifyingSitterOriginatedCompletionWithDb as record } from "../rewards/rewardProgressGrantWrites.js";
import { reserveRewardForBookingWithDb as reserve } from "../rewards/rewardReservationWrites.js";

const dbFor = (change = (row) => row) => ({ user: { async findUnique({ where, select }) {
  assert.deepEqual(select, { id: true, role: true });
  return change(ownerFixtureUser(where.id));
} } });
const resolve = (configuration = ownerConfiguration, db = dbFor()) => contract.resolveBusinessOwnerIdentityWithDb({ db, configuration });

test("exact configured pair resolves and is frozen", async () => {
  const pair = await resolve();
  assert.deepEqual(pair, ownerConfiguration); assert(Object.isFrozen(pair));
});
for (const configuration of [{}, { sitterId: ownerConfiguration.sitterId }, { operatorId: ownerConfiguration.operatorId }, { ...ownerConfiguration, sitterId: "  " }]) {
  test(`missing owner configuration fails closed (${Object.keys(configuration).join(",")})`, async () => {
    await assert.rejects(resolve(configuration), { code: "OWNER_CONFIGURATION_MISSING" });
  });
}
test("same identity for both roles is inconsistent", async () => {
  await assert.rejects(resolve({ operatorId: "same", sitterId: "same" }), { code: "OWNER_CONFIGURATION_INCONSISTENT" });
});
for (const [role, code] of [["OPERATOR", "OWNER_OPERATOR_INVALID"], ["SITTER", "OWNER_SITTER_INVALID"]]) {
  for (const invalid of ["missing", "wrong-role", "wrong-id"]) test(`${role} ${invalid} fails closed without identity disclosure`, async () => {
    const db = dbFor((row) => row.role !== role ? row : invalid === "missing" ? null : { ...row, [invalid === "wrong-role" ? "role" : "id"]: "invalid" });
    await assert.rejects(resolve(ownerConfiguration, db), (error) => {
      assert.equal(error.code, code);
      assert(!error.message.includes(ownerConfiguration.operatorId));
      assert(!error.message.includes(ownerConfiguration.sitterId));
      return true;
    });
  });
}
for (const userId of [ownerConfiguration.sitterId, ownerConfiguration.operatorId, "ordinary-sitter", "ordinary-operator", null]) {
  test(`predicate validates pair and matches only owner sitter (${userId === ownerConfiguration.sitterId ? "owner" : "non-owner"})`, async () => {
    assert.equal(await contract.isBusinessOwnerSitterWithDb({ db: dbFor(), configuration: ownerConfiguration, userId }), userId === ownerConfiguration.sitterId);
  });
}
test("predicate never interprets missing configuration as ordinary sitter", async () => {
  await assert.rejects(contract.isBusinessOwnerSitterWithDb({ db: dbFor(), configuration: {}, userId: "ordinary" }), { code: "OWNER_CONFIGURATION_MISSING" });
});
test("self assignment requires exact owner operator and returns linked sitter", async () => {
  assert.equal(await contract.resolveBusinessOwnerSelfAssignmentWithDb({ db: dbFor(), configuration: ownerConfiguration, actorId: ownerConfiguration.operatorId }), ownerConfiguration.sitterId);
  await assert.rejects(contract.resolveBusinessOwnerSelfAssignmentWithDb({ db: dbFor(), configuration: ownerConfiguration, actorId: "ordinary-operator" }), { code: "OWNER_OPERATOR_REQUIRED" });
});

// Execute the real server-only wrappers with only the framework/database import
// substituted. Public arguments cannot inject the internal configuration seam.
await swc.loadBindings();
function serverModule(relativePath, dependencies) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { code } = swc.transformSync(source, { jsc: { target: "es2022", parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const evaluated = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name === "server-only") return {};
    if (name === "react/jsx-runtime") return jsxRuntime;
    assert(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, evaluated, evaluated.exports);
  return evaluated.exports;
}
test("server owner wrapper ignores caller configuration and database overrides", async () => {
  const keys = ["BUSINESS_OWNER_OPERATOR_USER_ID", "BUSINESS_OWNER_SITTER_USER_ID"];
  const before = keys.map((key) => process.env[key]);
  try {
    process.env[keys[0]] = ownerConfiguration.operatorId;
    process.env[keys[1]] = ownerConfiguration.sitterId;
    const service = serverModule("./businessOwnerIdentity.js", { "../db.js": { prisma: dbFor() }, "./businessOwnerIdentityContract.js": contract });
    assert.deepEqual(await service.resolveBusinessOwnerIdentity({ configuration: { operatorId: "forged", sitterId: "forged" }, db: {} }), ownerConfiguration);
    assert.equal(await service.isBusinessOwnerSitter("ordinary", { configuration: { sitterId: "ordinary" } }), false);
    assert.equal(await service.resolveBusinessOwnerSelfAssignment(ownerConfiguration.operatorId), ownerConfiguration.sitterId);
  } finally { keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; }); }
});

function rewardDb(sitterId) {
  const writes = [];
  const tx = {
    ...dbFor((row) => row),
    booking: { async findUnique() { return { id: "booking", sitterId, status: "COMPLETED", attributionSnapshot: {
      referringSitterId: sitterId, requestedSitterId: sitterId, clientOriginKind: "SITTER_REFERRAL", compensationLane: "SITTER_ORIGINATED",
    }, visits: [{ status: "COMPLETED", performedBySitterId: sitterId, completedAt: new Date(0) }] }; } },
    sitterRewardEvent: { async findUnique() { return null; }, async aggregate() { return { _sum: { progressDelta: 0 } }; }, async create({ data }) { writes.push(data); return { id: "event", ...data }; } },
    sitterRewardAccount: { async createMany() { writes.push("account"); }, async findUnique() { return { id: "account", sitterId, rewardLevel: 0, progressCount: 0, version: 1, currentGrantId: null }; }, async update() { writes.push("progress"); return { rewardLevel: 0, progressCount: 1 }; } },
    sitterRewardGrant: { async findFirst() { return null; } },
    sitterRewardReservation: { async findUnique() { return null; } },
    async $queryRaw() { return []; },
  };
  tx.user.findUnique = async ({ where }) => ownerFixtureUser(where.id) ?? { id: sitterId, role: "SITTER" };
  return { writes, tx, db: { $transaction: (work) => work(tx) } };
}
test("owner progress returns stable exclusion before any write", async () => {
  const f = rewardDb(ownerConfiguration.sitterId);
  const result = await record({ db: f.db, bookingId: "booking", ownerConfiguration });
  assert.equal(result.status, "NOT_QUALIFIED"); assert.equal(result.reasonCode, "OWNER_REWARD_EXCLUDED"); assert.deepEqual(f.writes, []);
});
test("ordinary qualified sitter still receives exactly one progress credit", async () => {
  const f = rewardDb("ordinary");
  const result = await record({ db: f.db, bookingId: "booking", ownerConfiguration });
  assert.equal(result.status, "RECORDED"); assert.equal(result.progressAfter, 1);
  assert.equal(f.writes.filter((v) => v.progressDelta === 1).length, 1);
});
test("owner cannot reserve ordinary reward benefit", async () => {
  const f = rewardDb(ownerConfiguration.sitterId), read = f.tx.booking.findUnique;
  f.tx.booking.findUnique = async () => ({ ...await read(), status: "CONFIRMED" });
  const result = await reserve({ db: f.db, bookingId: "booking", ownerConfiguration });
  assert.equal(result.status, "NOT_ELIGIBLE"); assert.equal(result.reasonCode, "OWNER_REWARD_EXCLUDED"); assert.deepEqual(f.writes, []);
});
for (const operation of ["progress", "reserve"]) test(`${operation} fails closed with missing owner config and no writes`, async () => {
  const f = rewardDb("ordinary");
  if (operation === "reserve") { const read = f.tx.booking.findUnique; f.tx.booking.findUnique = async () => ({ ...await read(), status: "CONFIRMED" }); }
  await assert.rejects((operation === "progress" ? record : reserve)({ db: f.db, bookingId: "booking", ownerConfiguration: {} }), { code: "OWNER_CONFIGURATION_MISSING" });
  assert.deepEqual(f.writes, []);
});
test("reward server services do not forward caller owner overrides", async () => {
  const calls = [], prisma = {};
  const progress = serverModule("../rewards/rewardProgressGrantService.js", { "../db.js": { prisma }, "./rewardProgressGrantWrites.js": {
    recordQualifyingSitterOriginatedCompletionWithDb: (args) => calls.push(args),
  } });
  const reservation = serverModule("../rewards/rewardReservationService.js", { "../db.js": { prisma }, "./rewardReservationWrites.js": {
    reserveRewardForBookingWithDb: (args) => calls.push(args), consumeRewardReservationWithDb() {}, releaseRewardReservationWithDb() {},
  } });
  const input = { bookingId: "booking", ownerConfiguration: { sitterId: "forged" }, owner: false, isBusinessOwner: () => false, db: {} };
  progress.recordQualifyingSitterOriginatedCompletion(input); reservation.reserveRewardForBooking(input);
  assert.deepEqual(calls, [{ db: prisma, bookingId: "booking" }, { db: prisma, bookingId: "booking" }]);
});

for (const mode of ["self", "explicit", "invalid-owner", "other-operator"]) test(`real assignment action: ${mode}`, async () => {
  const actorId = mode === "other-operator" ? "other-operator" : ownerConfiguration.operatorId;
  const calls = [], db = dbFor();
  const action = serverModule("../../app/dashboard/operator/bookings/actions.js", {
    "@/lib/visits/reviewMissedVisit": {},
    "@/lib/db": { prisma: db }, "@/auth": { requireRole: async () => ({ user: { id: actorId } }) },
    "next/cache": { revalidatePath() {} }, "next/navigation": {},
    "@/lib/bookings/cancellation/canonicalCancellation": {}, "@/lib/bookings/economics/bookingEconomics": {},
    "@/lib/bookings/cancelBookingTransaction": {}, "@/lib/bookings/economics/completionService": {},
    "@/lib/bookings/confirmation/confirmationService": { assignBookingSitterWithDb: async (args) => { calls.push(args); return { ok: true }; } },
    "@/lib/bookings/businessOwnerIdentityContract": contract,
    "@/lib/bookings/businessOwnerIdentity": { resolveBusinessOwnerSelfAssignment: (id) => contract.resolveBusinessOwnerSelfAssignmentWithDb({
      db, actorId: id, configuration: mode === "invalid-owner" ? {} : ownerConfiguration,
    }) },
  });
  // Authentication lookup is independent from owner validation.
  const find = db.user.findUnique;
  db.user.findUnique = (args) => args.select.role ? find(args) : { id: actorId };
  const form = new FormData(); form.set("bookingId", "booking"); form.set("sitterId", "explicit-sitter");
  form.set("assignToMe", String(mode !== "explicit"));
  form.set("BUSINESS_OWNER_SITTER_USER_ID", "forged");
  const result = await action.assignSitter(form);
  if (mode === "invalid-owner" || mode === "other-operator") {
    assert.equal(result.ok, false); assert.equal(calls.length, 0);
    assert.equal(result.code, mode === "invalid-owner" ? "OWNER_CONFIGURATION_MISSING" : "OWNER_OPERATOR_REQUIRED");
  } else {
    assert.equal(result.ok, true); assert.equal(calls.length, 1);
    assert.equal(calls[0].sitterId, mode === "self" ? ownerConfiguration.sitterId : "explicit-sitter");
    assert.equal(calls[0].actorId, actorId);
  }
});

for (const surface of ["page", "send"]) for (const role of [null, "SITTER", "OPERATOR"]) test(`generic operator conversation ${surface}: ${role ?? "anonymous"}`, async () => {
  let reads = 0, writes = 0;
  const denied = new Error("ACCESS_DENIED");
  const auth = { requireRole: async (roles) => { assert.deepEqual(roles, ["OPERATOR"]); if (role !== "OPERATOR") throw denied; return { user: { id: "operator" } }; } };
  const dependencies = { "@/auth": auth,
    "@/lib/db": { prisma: { conversation: { upsert: async () => { writes++; return { id: "conversation" }; } }, message: { create: async () => { writes++; } } } },
    "next/cache": { revalidatePath() {} }, "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "next/link": () => null, "./MessageForm": () => null, "@/components/messaging/MessageAutoRefresh": () => null,
    "@/lib/messaging/bookingThread": { ensureBookingConversation: async () => { writes++; return { id: "conversation" }; } },
    "@/lib/messaging/getBookingConversation": { getBookingConversation: async () => { reads++; return null; } },
    "@/lib/messaging/pollingFingerprint": {},
  };
  const service = serverModule(surface === "page" ? "../../app/dashboard/messages/[bookingId]/page.jsx" : "../../app/dashboard/messages/actions.js", dependencies);
  const form = new FormData(); form.set("bookingId", "booking"); form.set("body", "Test message");
  const run = () => surface === "page" ? service.default({ params: { bookingId: "booking" } }) : service.sendBookingMessage(form);
  if (role !== "OPERATOR") { await assert.rejects(run, (error) => error === denied); assert.equal(reads + writes, 0); }
  else if (surface === "page") { await assert.rejects(run, /NOT_FOUND/); assert.equal(reads, 1); }
  else { await run(); assert.equal(writes, 2); }
});
