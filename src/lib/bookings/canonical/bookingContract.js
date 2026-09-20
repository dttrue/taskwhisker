import { dateNumber as sharedDateNumber, timeMinutes as sharedTimeMinutes, businessWallTime as sharedBusinessWallTime } from "../../calendar/businessTime.js";
import { captureCareInstructions } from "../careSnapshot/contract.js";
import { createHash } from "node:crypto";
import { BUSINESS_TIME_ZONE } from "../../visits/visitOperations.js";
import { normalizeCanonicalQuotePets } from "../../pricing/calculateCanonicalClientQuote.js";
import { normalizeClientIdentity } from "../../attribution/clientAttributionContract.js";
import { hashPublicReferralCode } from "../../referrals/sitterReferralCodeContract.js";

export class CanonicalBookingError extends Error {
  constructor(code, message) { super(message); this.name = "CanonicalBookingError"; this.code = code; }
}
export function reject(code, message) { throw new CanonicalBookingError(code, message); }
export function requiredText(value, label, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) reject("INVALID_INPUT", `${label} is invalid.`);
  return value.trim();
}
function optionalText(value, label) { return value == null || value === "" ? null : requiredText(value, label, 1000); }

// Keep canonical error types stable while sharing the timezone conversion.
export function dateNumber(value) { try { return sharedDateNumber(value); } catch (error) { reject(error.code, error.message); } }
function timeMinutes(value) { try { return sharedTimeMinutes(value); } catch (error) { reject(error.code, error.message); } }
export function businessWallTime(date, time) { try { return sharedBusinessWallTime(date, time); } catch (error) { reject(error.code, error.message); } }

export function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") reject("INVALID_SCHEDULE", "Schedule is required.");
  if (schedule.kind === "OVERNIGHT_STAY") {
    const start = dateNumber(schedule.arrivalDate), end = dateNumber(schedule.departureDate);
    if (end <= start || (end - start) / 86_400_000 > 366) reject("INVALID_SCHEDULE", "Stay must contain 1 to 366 nights.");
    timeMinutes(schedule.arrivalTime); timeMinutes(schedule.departureTime);
    return { kind: schedule.kind, arrivalDate: schedule.arrivalDate, departureDate: schedule.departureDate, arrivalTime: schedule.arrivalTime, departureTime: schedule.departureTime };
  }
  if (schedule.kind !== "TIMED_VISIT" || !Array.isArray(schedule.visits) || !schedule.visits.length || schedule.visits.length > 366) reject("INVALID_SCHEDULE", "Select 1 to 366 timed visits.");
  const visits = schedule.visits.map((visit) => {
    if (!visit || typeof visit !== "object") reject("INVALID_SCHEDULE", "Every visit must have a date and times.");
    const { date, startTime, endTime } = visit;
    dateNumber(date);
    const start = timeMinutes(startTime), end = timeMinutes(endTime);
    if (start < 7 * 60 || end > 22 * 60 || end <= start) reject("INVALID_SCHEDULE", "Daytime visits require increasing times within 07:00–22:00.");
    return { date, startTime, endTime };
  }).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  return { kind: schedule.kind, visits };
}
export function deriveSchedule(schedule, careOption) {
  const { billingUnit, scheduleKind } = careOption.offering;
  if (schedule.kind !== scheduleKind || !((billingUnit === "VISIT" && scheduleKind === "TIMED_VISIT") || (billingUnit === "NIGHT" && scheduleKind === "OVERNIGHT_STAY"))) reject("INVALID_SCHEDULE", "Schedule and catalog billing semantics disagree.");
  const windows = [];
  if (scheduleKind === "OVERNIGHT_STAY") {
    for (let day = dateNumber(schedule.arrivalDate); day < dateNumber(schedule.departureDate); day += 86_400_000) {
      const date = new Date(day).toISOString().slice(0, 10);
      const next = new Date(day + 86_400_000).toISOString().slice(0, 10);
      windows.push({ date: businessWallTime(date, "00:00"), startTime: businessWallTime(date, schedule.arrivalTime), endTime: businessWallTime(next, schedule.departureTime) });
    }
  } else {
    if (!Number.isInteger(careOption.durationMinutes) || careOption.durationMinutes <= 0) reject("INVALID_CONFIGURATION", "Timed care requires a duration.");
    for (const v of schedule.visits) {
      if (timeMinutes(v.endTime) - timeMinutes(v.startTime) !== careOption.durationMinutes) reject("INVALID_SCHEDULE", "Visit duration differs from the selected option.");
      windows.push({ date: businessWallTime(v.date, "00:00"), startTime: businessWallTime(v.date, v.startTime), endTime: businessWallTime(v.date, v.endTime) });
    }
  }
  for (let i = 0; i < windows.length; i++) {
    if (windows[i].endTime <= windows[i].startTime || (i && windows[i].startTime < windows[i - 1].endTime)) reject("INVALID_SCHEDULE", "Duplicate or overlapping visits are not allowed.");
  }
  return { quantity: windows.length, windows, startTime: windows[0].startTime, endTime: windows.at(-1).endTime };
}

// Only actual choices survive normalization. Browser money, quantity, IDs for
// assignment/lane, currency, versions and timestamps are never copied.
export function normalizeBookingIntent(input, operatorId) {
  const client = { name: requiredText(input?.client?.name, "client.name"), ...normalizeClientIdentity(input?.client) };
  const schedule = normalizeSchedule(input?.schedule);
  const location = {};
  for (const field of ["addressLine1", "addressLine2", "city", "state", "postalCode", "country", "accessInstructions", "locationNotes"]) location[field] = optionalText(input?.location?.[field], field);
  const publicCode = input?.referralCode == null ? null : requiredText(input.referralCode, "referralCode");
  const referralCodeHash = publicCode ? hashPublicReferralCode(publicCode) : null;
  if (input?.requestReferringSitter != null && typeof input.requestReferringSitter !== "boolean") reject("INVALID_INPUT", "requestReferringSitter must be boolean.");
  const requestReferringSitter = input?.requestReferringSitter === true;
  if (requestReferringSitter && !publicCode) reject("INVALID_INPUT", "A verified referral is required to request its sitter.");
  let petDetails = null;
  if (input?.petDetails != null) {
    const details = input.petDetails;
    if (!details || typeof details !== "object" || Array.isArray(details)) reject("INVALID_INPUT", "Invalid pet details.");
    const dogSize = details.dogSize ?? [];
    if (!Array.isArray(dogSize) || dogSize.some((size) => !["SMALL", "MEDIUM", "LARGE"].includes(size))) reject("INVALID_INPUT", "Invalid dog size.");
    const weightClass = details.weightClass ?? null;
    if (weightClass !== null && !["TOY", "SMALL_10_25", "MEDIUM_26_50", "LARGE_51_80", "XL_81_PLUS"].includes(weightClass)) reject("INVALID_INPUT", "Invalid weight class.");
    petDetails = { dogSize: [...new Set(dogSize)].sort(), weightClass };
  }
  const intent = {
    operatorId: requiredText(operatorId, "operatorId"), client,
    careOptionCode: requiredText(input?.careOptionCode, "careOptionCode"),
    pets: normalizeCanonicalQuotePets(input?.pets), schedule, timeZone: BUSINESS_TIME_ZONE,
    location, petDetails, notes: captureCareInstructions(input?.notes).careInstructions, referralCodeHash,
    sitterIntent: requestReferringSitter ? "REFERRING_SITTER" : "CONFIGURED_DEFAULT",
  };
  return { intent, publicCode, inputHash: createHash("sha256").update(JSON.stringify(intent)).digest("hex") };
}
