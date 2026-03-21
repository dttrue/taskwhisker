// src/app/dashboard/operator/_components/OperatorMapInner.jsx
"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FitBounds({ bookings }) {
  const map = useMap();

  useEffect(() => {
    if (!bookings.length) return;

    const bounds = L.latLngBounds(bookings.map((b) => [b.lat, b.lng]));

    map.fitBounds(bounds, { padding: [30, 30] });
  }, [bookings, map]);

  return null;
}

export default function OperatorMapInner({ bookings = [] }) {
  const validBookings = bookings.filter((b) => b.lat != null && b.lng != null);

  const center = validBookings.length
    ? [validBookings[0].lat, validBookings[0].lng]
    : [40.7128, -74.006];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-4 text-sm font-medium text-zinc-900">
        Service Locations
      </div>

      <div className="h-[400px] w-full overflow-hidden rounded-b-xl">
        <MapContainer
          center={center}
          zoom={11}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds bookings={validBookings} />

          {validBookings.map((b) => (
            <Marker key={b.id} position={[b.lat, b.lng]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">
                    {b.clientName || "Client"}
                  </div>
                  <div>{b.serviceSummary || "Booking"}</div>
                  <div>{b.address || "No address"}</div>
                  <a
                    href={`/dashboard/operator/bookings/${b.id}`}
                    className="mt-2 inline-block underline"
                  >
                    View Booking
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}