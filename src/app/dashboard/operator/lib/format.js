// src/app/dashboard/operator/lib/format.js

export function formatMoney(cents) {
  if (!Number.isSafeInteger(cents)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
