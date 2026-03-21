// src/app/dashboard/operator/lib/geocodeAddress.js
export async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    address
  )}&limit=1`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "TaskWhisker/1.0",
    },
  });

  if (!res.ok) {
    throw new Error("Geocoding request failed");
  }

  const data = await res.json();

  if (!data.length) {
    return null;
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}
