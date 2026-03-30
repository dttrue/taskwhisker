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

import {
  formatDateTime,
  getActionableVisitTime,
  getSortTime,
  isVisitInGraceWindow,
} from "../lib/sitterMapUtils";

import { makeNumberedIcon } from "../lib/mapIcons";

function fitRoute(map, bookings) {
  if (!map || !bookings.length) return;

  if (bookings.length === 1) {
    map.setView([bookings[0].lat, bookings[0].lng], 13);
    return;
  }

  const bounds = L.latLngBounds(bookings.map((b) => [b.lat, b.lng]));
  map.fitBounds(bounds, { padding: [30, 30] });
}

function FitBounds({ bookings, selectedBookingId }) {
  const map = useMap();

  useEffect(() => {
    if (selectedBookingId) return;
    fitRoute(map, bookings);
  }, [bookings, map, selectedBookingId]);

  return null;
}

function FocusSelectedStop({ bookings, selectedBookingId, markerRefs }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedBookingId) return;

    const booking = bookings.find((b) => b.id === selectedBookingId);
    if (!booking) return;

    map.flyTo([booking.lat, booking.lng], 14, {
      animate: true,
      duration: 0.6,
    });

    const marker = markerRefs.current[selectedBookingId];
    if (marker?.openPopup) {
      marker.openPopup();
    }
  }, [bookings, selectedBookingId, markerRefs, map]);

  return null;
}

function RecenterControl({ bookings }) {
  const map = useMap();

  if (!bookings.length) return null;

  return (
    <div className="absolute right-3 top-3 z-[1000]">
      <button
        type="button"
        onClick={() => fitRoute(map, bookings)}
        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium shadow-md transition hover:bg-zinc-50 active:scale-95"
      >
        Recenter
      </button>
    </div>
  );
}

export default function SitterMapInner({
  bookings = [],
  selectedBookingId = null,
  onSelectBooking,
}) {
  const markerRefs = useRef({});

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
    <div className="relative h-[400px] w-full overflow-hidden rounded-xl">
      <style jsx global>{`
        @keyframes sitterPulse {
          0% {
            transform: scale(0.9);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }
      `}</style>

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

        <FitBounds
          bookings={validBookings}
          selectedBookingId={selectedBookingId}
        />

        <FocusSelectedStop
          bookings={validBookings}
          selectedBookingId={selectedBookingId}
          markerRefs={markerRefs}
        />

        <RecenterControl bookings={validBookings} />

        {routePositions.length > 1 ? (
          <Polyline positions={routePositions} />
        ) : null}

        {validBookings.map((booking, index) => {
          const now = new Date();
          const actionableVisitTime = getActionableVisitTime(booking, now);
          const isInGrace = isVisitInGraceWindow(booking, now);

          return (
            <Marker
              key={booking.id}
              position={[booking.lat, booking.lng]}
              icon={makeNumberedIcon(
                index + 1,
                booking.id === selectedBookingId,
                isInGrace
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