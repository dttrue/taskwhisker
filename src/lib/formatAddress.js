// src/app/dashboard/operator/lib/formatAddress.js

export function formatServiceAddress(location = {}) {
  const parts = [
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.state,
    location.postalCode,
  ].filter(Boolean);

  return parts.join(", ");
}

export function formatCityStateZip(location = {}) {
  const parts = [location.city, location.state, location.postalCode].filter(
    Boolean
  );

  return parts.join(" ");
}
