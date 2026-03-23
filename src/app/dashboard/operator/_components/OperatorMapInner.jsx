"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import { useEffect, useMemo } from "react";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;

function makeMarkerIcon(color) {
  return new L.DivIcon({
    className: "",
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: ${color};
        border: 3px solid white;
        box-shadow: 0 1px 6px rgba(0,0,0,0.35);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

const STATUS_COLORS = {
  REQUESTED: "#f59e0b",
  CONFIRMED: "#22c55e",
  COMPLETED: "#3b82f6",
  CANCELED: "#71717a",
};

function getStatusIcon(status) {
  return makeMarkerIcon(STATUS_COLORS[status] || "#52525b");
}

function getSortTime(booking) {
  const candidate =
    booking.todayVisitStart ||
    booking.nextVisitStart ||
    booking.startTime ||
    null;

  if (!candidate) return Number.MAX_SAFE_INTEGER;

  const time = new Date(candidate).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
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

export default function OperatorMapInner({ bookings = [] }) {
  const validBookings = useMemo(() => {
    return bookings
      .filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng))
      .sort((a, b) => getSortTime(a) - getSortTime(b));
  }, [bookings]);

  const center = validBookings.length
    ? [validBookings[0].lat, validBookings[0].lng]
    : [40.7128, -74.006];

  const routePositions = validBookings.map((b) => [b.lat, b.lng]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-4 text-sm font-medium text-zinc-900">
        Service Locations
      </div>

      <div className="h-[400px] w-full overflow-hidden rounded-xl">
        <MapContainer
          center={center}
          zoom={11}
          scrollWheelZoom={false}
          zoomControl={true}
          minZoom={3}
          maxZoom={18}
          className="h-full w-full"
          preferCanvas={true}
          doubleClickZoom={false}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds bookings={validBookings} />

          {routePositions.length > 1 ? (
            <Polyline positions={routePositions} />
          ) : null}

          {validBookings.map((b) => (
            <Marker
              key={b.id}
              position={[b.lat, b.lng]}
              icon={getStatusIcon(b.status)}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">
                    {b.clientName || "Client"}
                  </div>
                  <div>{b.serviceSummary || "Booking"}</div>
                  <div className="mt-1">
                    Status:{" "}
                    <span className="font-medium">{b.status || "UNKNOWN"}</span>
                  </div>
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

      <div className="flex flex-wrap gap-3 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
          Requested
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
          Confirmed
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
          Completed
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-zinc-500" />
          Canceled
        </div>
      </div>
    </div>
  );
}
