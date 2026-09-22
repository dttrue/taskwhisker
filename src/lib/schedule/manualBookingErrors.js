import { ManualInputError } from "./manualInput.js";

function fieldErrors(error, input) {
  if (error instanceof ManualInputError) return error.fieldErrors;
  const fields = {
    CLIENT_UNAVAILABLE: ["clientId"], CLIENT_EXISTS: ["client.email"],
    BLOCKED_CLIENT: [input?.clientId ? "clientId" : "client.name"],
    PET_UNAVAILABLE: ["petIds"], INVALID_CONFIGURATION: ["serviceCode"], INVALID_PRICE: ["serviceCode"],
    SERVICE_UNAVAILABLE: [error.message === "A selected extra is no longer available." ? "extras" : "serviceCode"],
  };
  // A schedule error without trusted row metadata belongs in the summary.
  return Object.fromEntries((fields[error.code] || []).map((key) => [key, error.message]));
}

// Only known application errors cross the action boundary. Transaction, token,
// conflict and retry failures have no field mapping, even if an error carries one.
export function manualBookingFailure(error, input) {
  const safe = ["NOT_AUTHORIZED", "INVALID_INPUT", "INVALID_SCHEDULE", "INVALID_LOCAL_TIME", "INVALID_CONFIGURATION", "CLIENT_UNAVAILABLE", "CLIENT_EXISTS", "BLOCKED_CLIENT", "SERVICE_UNAVAILABLE", "PET_UNAVAILABLE", "INVALID_PRICE", "QUOTE_UNAVAILABLE", "REVIEW_REQUIRED", "PRICE_CHANGED", "VISIT_ALREADY_STARTED", "SCHEDULE_CONFLICT"];
  if (safe.includes(error.code) || error.code?.startsWith("OWNER_")) return { ok: false, code: error.code, error: error.message, fieldErrors: fieldErrors(error, input) };
  if (error.code === "P2002") return { ok: false, error: "A matching record was just created. Search for the client or retry your reviewed booking.", fieldErrors: {} };
  if (error.code === "P2034") return { ok: false, error: "The schedule changed while saving. Retry to check availability again.", fieldErrors: {} };
  return { ok: false, error: "The booking could not be processed. Please retry.", fieldErrors: {} };
}
