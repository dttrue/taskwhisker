// src/app/dashboard/sitter/_components/SitterMapInner.jsx
"use client";

import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function makeNumberedIcon(number, isSelected = false) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 24px;
        height: 24px;
        border-radius: 9999px;
        background: ${isSelected ? "#2563eb" : "#111827"};
        color: white;
        border: 2px solid white;
        box-shadow: 0 1px 6px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
      ">
        ${number}
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

function getActionableVisitTime(booking, now) {
  if (!now || !booking.todayVisitStart) return null;

  const todayVisit = new Date(booking.todayVisitStart);
  const time = todayVisit.getTime();

  if (Number.isNaN(time)) return null;
  if (time <= now.getTime()) return null;

  return todayVisit;
}

function getSortTime(booking, now) {
  const actionableVisit = getActionableVisitTime(booking, now);
  return actionableVisit ? actionableVisit.getTime() : Number.MAX_SAFE_INTEGER;
}

function FitBounds({ bookings }) {
  const map = useMap();

  useEffect(() => {
    if (!bookings.length) return;

    if (bookings.length === 1) {
      map.setView([bookings[0].lat, bookings[0].lng], 13);
      return;
    }

    const bounds = L.latLngBounds(bookings.map((b) => [b.lat, b.lng]));
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [bookings, map]);

  return null;
}

export default function SitterMapInner({
  bookings = [],
  selectedBookingId = null,
  onSelectBooking,
}) {
  const validBookings = useMemo(() => {
    const now = new Date();

    return bookings
      .filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng))
      .filter((b) => getActionableVisitTime(b, now))
      .sort((a, b) => getSortTime(a, now) - getSortTime(b, now));
  }, [bookings]);

  const center = validBookings.length
    ? [validBookings[0].lat, validBookings[0].lng]
    : [40.7128, -74.006];

  const routePositions = validBookings.map((b) => [b.lat, b.lng]);

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

        <FitBounds bookings={validBookings} />

        {routePositions.length > 1 ? (
          <Polyline positions={routePositions} />
        ) : null}

        {validBookings.map((booking, index) => {
          const actionableVisitTime = getActionableVisitTime(
            booking,
            new Date()
          );

          return (
            <Marker
              key={booking.id}
              position={[booking.lat, booking.lng]}
              icon={makeNumberedIcon(
                index + 1,
                booking.id === selectedBookingId
              )}
              eventHandlers={{
                click: () => {
                  onSelectBooking?.(booking.id);
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">
                    {`Stop ${index + 1} • ${booking.clientName}`}
                  </div>

                  <div className="mt-1 text-zinc-700">
                    {booking.serviceSummary}
                  </div>

                  <div className="mt-1 text-zinc-600">
                    Visit: {formatDateTime(actionableVisitTime)}
                  </div>

                  {booking.address ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        booking.address
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block text-zinc-600 underline"
                    >
                      {booking.address}
                    </a>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
