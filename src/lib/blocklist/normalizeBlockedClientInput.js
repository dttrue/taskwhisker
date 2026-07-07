// src/lib/blocklist/normalizeBlockedClientInput.js

export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizePostalCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function normalizeBlockedClientInput(input = {}) {
  return {
    name: normalizeText(input.name),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    addressLine1: normalizeText(input.addressLine1),
    addressLine2: normalizeText(input.addressLine2),
    city: normalizeText(input.city),
    state: normalizeText(input.state),
    postalCode: normalizePostalCode(input.postalCode),
  };
}
