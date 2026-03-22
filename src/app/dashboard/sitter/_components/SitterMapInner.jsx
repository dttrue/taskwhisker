// src/app/dashboard/sitter/_components/SitterMapInner.jsx
"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getStatusColor(status) {
  switch (status) {
    case "REQUESTED":
      return "#f59e0b";
    case "CONFIRMED":
      return "#22c55e";
    case "COMPLETED":
      return "#3b82f6";
    case "CANCELED":
      return "#6b7280";
    default:
      return "#71717a";
  }
}

function makeDotIcon(color) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 14px;
        height: 14px;
        border-radius: 9999px;
        background: ${color};
        border: 2px solid white;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.15);
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ bookings }) {
  const map = require("react-leaflet").useMap();

  useMemo(() => {
    if (!bookings.length) return;

    const bounds = L.latLngBounds(bookings.map((b) => [b.lat, b.lng]));

    map.fitBounds(bounds, { padding: [30, 30] });
  }, [bookings, map]);

  return null;
}

export default function SitterMapInner({ bookings = [] }) {
  const center = bookings.length
    ? [bookings[0].lat, bookings[0].lng]
    : [40.7128, -74.006];

  return (
    <div className="h-[400px] w-full overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom={false}
        zoomControl={true}
        minZoom={3}
        maxZoom={18}
        preferCanvas={true}
        doubleClickZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds bookings={bookings} />

        {bookings.map((booking) => (
          <Marker
            key={booking.id}
            position={[booking.lat, booking.lng]}
            icon={makeDotIcon(getStatusColor(booking.status))}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{booking.clientName}</div>
                <div className="mt-1 text-zinc-700">
                  {booking.serviceSummary}
                </div>
                <div className="mt-1 text-zinc-600">
                  Status: {booking.status}
                </div>
                <div className="mt-1 text-zinc-600">
                  Visit:{" "}
                  {formatDateTime(
                    booking.todayVisitStart || booking.nextVisitStart
                  )}
                </div>
                {booking.address ? (
                  <div className="mt-1 text-zinc-600">{booking.address}</div>
                ) : null}
                <div className="mt-2 text-xs text-zinc-500">
                  Payout: {formatMoney(booking.sitterPayoutCents)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
