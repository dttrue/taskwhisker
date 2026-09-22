import { normalizeSchedule } from "../bookings/canonical/bookingContract.js";
import { dateNumber, timeMinutes, businessWallTime, addCalendarDays } from "../calendar/businessTime.js";

export class ManualInputError extends Error {
  constructor(code, message, fieldErrors) {
    super(message);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// Keys describe this request's array positions, never browser-provided IDs or
// error mappings. Validate all independent controls before returning a summary.
export function normalizeManualInput(input) {
  const fieldErrors = {};
  let firstCode;
  function error(keys, message, code = "INVALID_INPUT") {
    firstCode ||= code;
    for (const key of keys) fieldErrors[key] ||= message;
  }
  function text(value, key, label, max = 200, optional = false) {
    if (optional && (value == null || value === "")) return null;
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
      error([key], `Enter a valid ${label}.`);
      return null;
    }
    return value.trim();
  }
  function check(key, work) {
    try { return work(); }
    catch (failure) { error([key], failure.message, failure.code); return null; }
  }
  const clientId = text(input?.clientId, "clientId", "client", 200, true);
  let client = null;
  if (!clientId) {
    client = {
      name: text(input?.client?.name, input?.client == null ? "clientId" : "client.name", input?.client == null ? "client" : "client name"),
      email: text(input?.client?.email, "client.email", "email", 254, true)?.toLowerCase() || null,
      phone: text(input?.client?.phone, "client.phone", "phone", 50, true),
    };
    if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) error(["client.email"], "Enter a valid email address.");
    for (const [key, label] of [["addressLine1", "street address"], ["addressLine2", "apartment / unit"], ["city", "city"], ["state", "state"], ["postalCode", "ZIP code"]]) {
      client[key] = text(input?.client?.[key], `client.${key}`, label, 200, true);
    }
  }
  const petIds = input?.petIds ?? [];
  if (!Array.isArray(petIds) || petIds.length > 20 || petIds.some((id) => typeof id !== "string" || !id || id.length > 200)) error(["petIds"], "Invalid pet selection.");
  const extras = input?.extras ?? [];
  const normalizedExtras = [];
  if (!Array.isArray(extras) || extras.length > 30) error(["extras"], "Invalid extras.");
  else extras.forEach((item, index) => {
    const code = text(item?.code, `extras.${index}.quantity`, "extra");
    if (!Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 366) error([`extras.${index}.quantity`], "Extra quantities must be between 1 and 366.");
    if (normalizedExtras.some((extra) => extra.code === code)) error([`extras.${index}.quantity`], "Select each extra once.");
    normalizedExtras.push({ code, quantity: item?.quantity });
  });
  const serviceCode = text(input?.serviceCode, "serviceCode", "service");
  const notes = text(input?.notes, "notes", "care notes", 1000, true);
  const submitted = input?.schedule;
  let schedule;
  if (submitted?.kind === "TIMED_VISIT" && Array.isArray(submitted.visits) && submitted.visits.length > 0 && submitted.visits.length <= 366) {
    const windows = [];
    submitted.visits.forEach((visit, index) => {
      const prefix = `visits.${index}`;
      const date = check(`${prefix}.date`, () => dateNumber(visit?.date));
      const start = check(`${prefix}.startTime`, () => timeMinutes(visit?.startTime));
      const end = check(`${prefix}.endTime`, () => timeMinutes(visit?.endTime));
      if (start !== null && end !== null && (start < 420 || end > 1320 || end <= start)) {
        error([`${prefix}.date`, `${prefix}.startTime`, `${prefix}.endTime`], "Daytime visits require increasing times within 07:00–22:00.", "INVALID_SCHEDULE");
      }
      if (date !== null && start !== null && end !== null) windows.push({ index, start: date + start * 60000, end: date + end * 60000 });
    });
    windows.sort((a, b) => a.start - b.start);
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].start < windows[i - 1].end) {
        const keys = [windows[i - 1], windows[i]].flatMap(({ index }) => ["date", "startTime", "endTime"].map((field) => `visits.${index}.${field}`));
        error(keys, "Duplicate or overlapping visits are not allowed.", "INVALID_SCHEDULE");
      }
    }
  } else if (submitted?.kind === "OVERNIGHT_STAY") {
    const arrival = check("arrivalDate", () => dateNumber(submitted.arrivalDate));
    const departure = check("departureDate", () => dateNumber(submitted.departureDate));
    const arrivalTime = check("arrivalTime", () => timeMinutes(submitted.arrivalTime));
    const departureTime = check("departureTime", () => timeMinutes(submitted.departureTime));
    if (arrival !== null && departure !== null) {
      const nights = (departure - arrival) / 86400000;
      if (nights < 1 || nights > 366) error(["arrivalDate", "departureDate"], "Stay must contain 1 to 366 nights.", "INVALID_SCHEDULE");
      else {
        for (let i = 0; i < nights; i++) {
          if (arrivalTime !== null) check("arrivalTime", () => businessWallTime(addCalendarDays(submitted.arrivalDate, i), submitted.arrivalTime));
          if (departureTime !== null) check("departureTime", () => businessWallTime(addCalendarDays(submitted.arrivalDate, i + 1), submitted.departureTime));
        }
        if (nights > 1 && arrivalTime !== null && departureTime !== null && departureTime > arrivalTime) error(["arrivalTime", "departureTime"], "Duplicate or overlapping visits are not allowed.", "INVALID_SCHEDULE");
      }
    }
  } else error(["schedule"], "Select 1 to 366 timed visits or an overnight stay.", "INVALID_SCHEDULE");
  if (Object.keys(fieldErrors).length) throw new ManualInputError(firstCode, Object.values(fieldErrors)[0], fieldErrors);
  // Preserve canonical normalization, ordering, accepted values and hash shape.
  schedule = normalizeSchedule(submitted);
  return { clientId, client, petIds: [...new Set(petIds)].sort(), serviceCode, schedule, notes,
    extras: normalizedExtras.sort((a, b) => a.code.localeCompare(b.code)) };
}
