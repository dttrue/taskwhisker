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
import { useEffect, useMemo, useRef } from "react";

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

function fitRoute(map, bookings) {
  if (!map || !bookings.length) return;

  if (bookings.length === 1) {
    map.setView([bookings[0].lat, bookings[0].lng], 13);
    return;
  }

  const bounds = L.latLngBounds(bookings.map((b) => [b.lat, b.lng]));
  map.fitBounds(bounds, { padding: [30, 30] });
}

function FitBounds({ bookings }) {
  const map = useMap();

  useEffect(() => {
    fitRoute(map, bookings);
  }, [bookings, map]);

  return null;
}

function RecenterButton({ bookings }) {
  const map = useMap();

  if (!bookings.length) return null;

  return (
    <button
      type="button"
      onClick={() => fitRoute(map, bookings)}
      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium shadow-md transition hover:bg-zinc-50 active:scale-95"
    >
      Recenter
    </button>
  );
}

export default function SitterMapInner({
  bookings = [],
  selectedBookingId = null,
  onSelectBooking,
}) {
  const markerRefs = useRef({});
  const mapRef = useRef(null);

  const validBookings = useMemo(() => {
    const now = new Date();

    return bookings
      .filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng))
      .filter((b) => getActionableVisitTime(b, now))
      .sort((a, b) => getSortTime(a, now) - getSortTime(b, now));
  }, [bookings]);

  useEffect(() => {
    if (!selectedBookingId) return;

    const booking = validBookings.find((b) => b.id === selectedBookingId);
    if (!booking) return;

    const map = mapRef.current;
    const marker = markerRefs.current[selectedBookingId];

    if (map) {
      map.flyTo([booking.lat, booking.lng], map.getZoom(), {
        animate: true,
        duration: 0.6,
      });
    }

    if (marker) {
      marker.openPopup();
    }
  }, [selectedBookingId, validBookings]);

  const center = validBookings.length
    ? [validBookings[0].lat, validBookings[0].lng]
    : [40.7128, -74.006];

  const routePositions = validBookings.map((b) => [b.lat, b.lng]);

  return (
    <div className="relative h-[400px] w-full overflow-hidden rounded-xl">
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
        ref={mapRef}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds bookings={validBookings} />

        <div className="absolute right-3 top-3 z-[1000]">
          <RecenterButton bookings={validBookings} />
        </div>

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
              ref={(instance) => {
                if (instance) {
                  markerRefs.current[booking.id] = instance;
                }
              }}
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
