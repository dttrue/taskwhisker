import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { scheduleAccess, clientScope, fail } from "./access.js";
import { deriveManualSchedule as deriveSchedule } from "./manualInput.js";
import { captureCareInstructions } from "../bookings/careSnapshot/contract.js";
import { legacyBookingPrice } from "../bookings/legacyPricing.js";
import { checkBlockedClientWithDb } from "../blocklist/blockedClientContract.js";
import { bookingTransaction, assertBookingAvailability } from "../calendar/bookingTransaction.js";
import { validatePreService } from "../bookings/confirmation/confirmationContract.js";

import { normalizeManualInput } from "./manualInput.js";
export { normalizeManualInput } from "./manualInput.js";

export async function manualOptions(db, actorId, search = "") {
  const access = await scheduleAccess(db, actorId);
  const query = typeof search === "string" ? search.trim().slice(0, 100) : "";
  const [clients, services, sitter] = await Promise.all([
    db.client.findMany({ where: { ...clientScope(access), ...(query ? { OR: [
      { name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { phone: { contains: query } },
    ] } : {}) }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 50,
      select: { id: true, name: true, email: true, phone: true, pets: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, species: true } } } }),
    db.service.findMany({ where: { isActive: true, category: { in: ["WALK", "DROP_IN", "OVERNIGHT", "EXTRA"] } }, orderBy: { name: "asc" },
      select: { code: true, name: true, category: true, durationMinutes: true, basePriceCents: true } }),
    db.user.findUnique({ where: { id: access.sitterId }, select: { name: true } }),
  ]);
  return { clients, services, sitterName: sitter?.name || "Bridget" };
}

async function prepare(db, access, intent) {
  let client;
  if (intent.clientId) {
    client = await db.client.findFirst({ where: { id: intent.clientId, ...clientScope(access) } });
    if (!client) fail("CLIENT_UNAVAILABLE", "Select a client from your client list.");
  } else {
    client = intent.client;
    if (client.email && await db.client.findFirst({ where: { email: { equals: client.email, mode: "insensitive" } }, select: { id: true } })) {
      fail("CLIENT_EXISTS", "This email is already registered. Select the existing client, or contact the operator if unavailable.");
    }
  }
  if ((await checkBlockedClientWithDb(db, client)).blocked) fail("BLOCKED_CLIENT", "This client cannot be booked. Review the blocked-client list.");
  const service = await db.service.findUnique({ where: { code: intent.serviceCode } });
  if (!service?.isActive || !["WALK", "DROP_IN", "OVERNIGHT"].includes(service.category)) fail("SERVICE_UNAVAILABLE", "Select an active service.");
  // Adapt the existing Service catalog to the existing schedule generator only;
  // this does not create canonical bookings or activate canonical economics.
  const overnight = service.category === "OVERNIGHT";
  const schedule = deriveSchedule(intent.schedule, { durationMinutes: service.durationMinutes,
    offering: { billingUnit: overnight ? "NIGHT" : "VISIT", scheduleKind: overnight ? "OVERNIGHT_STAY" : "TIMED_VISIT" } });
  const pets = intent.petIds.length && intent.clientId ? await db.pet.findMany({ where: { id: { in: intent.petIds }, clientId: client.id, archivedAt: null } }) : [];
  if (pets.length !== intent.petIds.length) fail("PET_UNAVAILABLE", "Select current pets belonging to this client, or continue without pets.");
  pets.sort((a, b) => intent.petIds.indexOf(a.id) - intent.petIds.indexOf(b.id));
  const extraServices = intent.extras.length ? await db.service.findMany({ where: { code: { in: intent.extras.map((item) => item.code) }, category: "EXTRA", isActive: true } }) : [];
  const extras = intent.extras.map((item) => {
    const extra = extraServices.find((service) => service.code === item.code);
    if (!extra) fail("SERVICE_UNAVAILABLE", "A selected extra is no longer available.");
    return { code: extra.code, name: extra.name, quantity: item.quantity, unitPriceCents: extra.basePriceCents, totalPriceCents: extra.basePriceCents * item.quantity };
  });
  if (![service.basePriceCents, ...extras.map((item) => item.unitPriceCents)].every((price) => Number.isSafeInteger(price) && price >= 0)) fail("INVALID_PRICE", "Service pricing needs operator review.");
  const price = legacyBookingPrice(service.basePriceCents, schedule.quantity, extras);
  if (!Object.values(price).every((amount) => Number.isSafeInteger(amount) && amount >= 0 && amount <= 2147483647)) fail("INVALID_PRICE", "Booking total is outside the supported range.");
  const summary = { service: service.name, unitPriceCents: service.basePriceCents, quantity: schedule.quantity,
    unit: overnight ? "night" : "visit", extras, ...price };
  return { client, service, schedule, pets, extras, price, summary };
}

function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sign(payload, secret) {
  if (typeof secret !== "string" || secret.length < 16) fail("QUOTE_UNAVAILABLE", "Booking review is unavailable. Contact the operator.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
function readQuote(token, secret) {
  if (typeof token !== "string" || token.length > 4000) fail("REVIEW_REQUIRED", "Review the booking total before saving.");
  const [body, signature, extra] = token.split(".");
  const expected = sign(body || "", secret);
  if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) fail("REVIEW_REQUIRED", "Review the booking total again.");
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); }
  catch { fail("REVIEW_REQUIRED", "Review the booking total again."); }
}

export async function quoteManualBooking({ db, actorId, input, secret, now = new Date() }) {
  const access = await scheduleAccess(db, actorId);
  const intent = normalizeManualInput(input);
  const prepared = await prepare(db, access, intent);
  validatePreService(prepared.schedule.windows, now);
  const body = Buffer.from(JSON.stringify({ bookingId: randomUUID(), actorId, operatorId: access.operatorId, sitterId: access.sitterId,
    inputHash: digest(intent), priceHash: digest(prepared.summary), expiresAt: +now + 30 * 60 * 1000 })).toString("base64url");
  return { summary: prepared.summary, token: `${body}.${sign(body, secret)}` };
}

async function databaseNow(tx) {
  const [clock] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`;
  return clock?.now;
}

export async function createManualBooking({ db, actorId, input, token, secret }) {
  const intent = normalizeManualInput(input);
  const reviewed = readQuote(token, secret);
  return bookingTransaction(db, async (tx) => {
    const access = await scheduleAccess(tx, actorId);
    if (reviewed.actorId !== actorId || reviewed.operatorId !== access.operatorId || reviewed.sitterId !== access.sitterId || reviewed.inputHash !== digest(intent)) fail("REVIEW_REQUIRED", "Booking details changed. Review the total again.");
    // A retained signed review token is also the idempotency key. No new schema.
    const prior = await tx.booking.findUnique({ where: { id: reviewed.bookingId }, select: { id: true, operatorId: true, sitterId: true } });
    if (prior) {
      if (prior.operatorId !== access.operatorId || prior.sitterId !== access.sitterId) fail("REVIEW_REQUIRED", "This booking has changed. Return to the schedule.");
      return { bookingId: prior.id };
    }
    const now = await databaseNow(tx);
    if (!Number.isFinite(+now) || reviewed.expiresAt <= +now) fail("REVIEW_REQUIRED", "Your review expired. Review the total again.");
    const { client, service, schedule, pets, extras, price, summary } = await prepare(tx, access, intent);
    if (reviewed.priceHash !== digest(summary)) fail("PRICE_CHANGED", "Service pricing changed. Review the updated total before saving.");
    validatePreService(schedule.windows, now);
    await assertBookingAvailability(tx, access.sitterId, schedule.windows);
    const savedClient = intent.clientId ? client : await tx.client.create({ data: client });
    const { clientTotalCents, platformFeeCents, sitterPayoutCents } = price;
    const booking = await tx.booking.create({ data: {
      id: reviewed.bookingId, clientId: savedClient.id, operatorId: access.operatorId, sitterId: access.sitterId,
      startTime: schedule.startTime, endTime: schedule.endTime, status: "CONFIRMED", confirmedAt: now,
      serviceId: service.id, serviceType: service.category, serviceSummary: service.name,
      clientTotalCents, platformFeeCents, sitterPayoutCents,
      notes: intent.notes, ...captureCareInstructions(intent.notes), petNames: pets.map((pet) => pet.name),
      serviceAddressLine1: client.addressLine1, serviceAddressLine2: client.addressLine2, serviceCity: client.city,
      serviceState: client.state, servicePostalCode: client.postalCode, serviceCountry: "US",
      bookingPets: { create: pets.map((pet, position) => ({ petId: pet.id, position, nameSnapshot: pet.name, speciesSnapshot: pet.species })) },
    } });
    await tx.visit.createMany({ data: schedule.windows.map((window) => ({ ...window, bookingId: booking.id, operatorId: access.operatorId, sitterId: access.sitterId, status: "CONFIRMED" })) });
    const lineItems = [{ label: service.name, quantity: schedule.quantity, unitPriceCents: service.basePriceCents, totalPriceCents: price.baseServiceTotalCents },
      ...extras.map(({ name, quantity, unitPriceCents, totalPriceCents }) => ({ label: name, quantity, unitPriceCents, totalPriceCents }))];
    await tx.bookingLineItem.createMany({ data: lineItems.map((item) => ({ ...item, bookingId: booking.id })) });
    await tx.bookingHistory.create({ data: { bookingId: booking.id, changedByUserId: actorId, toSitterId: access.sitterId,
      fromStatus: null, toStatus: "CONFIRMED", note: "Manual booking created from Bridget’s schedule; total reviewed before submission." } });
    validatePreService(schedule.windows, await databaseNow(tx));
    return { bookingId: booking.id };
  }, { retryUnique: true });
}
