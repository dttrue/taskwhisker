"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

import { BUSINESS_TIME_ZONE } from "@/lib/visits/visitOperations";

const STATUS_LABELS = {
  CURRENT: "Current",
  UPCOMING: "Upcoming",
  MISSED: "Missed",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
  SCHEDULED: "Scheduled",
};

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function makeNumberedIcon(stopNumber, selected = false) {
  const size = selected ? 40 : 34;
  const background = selected ? "#275a49" : "#ffffff";
  const color = selected ? "#ffffff" : "#222522";
  const ring = selected
    ? "0 0 0 4px rgba(201, 223, 212, 0.95), 0 8px 18px rgba(39, 90, 73, 0.28)"
    : "0 5px 14px rgba(0, 0, 0, 0.18)";

  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${background};color:${color};border:2px solid #ffffff;box-shadow:${ring};font-size:12px;font-weight:700;line-height:1;">${stopNumber}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function fitRoute(map, visits) {
  if (!visits.length) return;

  if (visits.length === 1) {
    map.setView([visits[0].lat, visits[0].lng], 13);
    return;
  }

  const bounds = L.latLngBounds(visits.map((visit) => [visit.lat, visit.lng]));
  map.fitBounds(bounds, { padding: [32, 32] });
}

function FitRoute({ visits }) {
  const map = useMap();

  useEffect(() => {
    fitRoute(map, visits);
  }, [map, visits]);

  return null;
}

function FocusSelectedStop({ visits, selectedVisitId, markerRefs }) {
  const map = useMap();
  const previousSelectedVisitId = useRef(selectedVisitId);

  useEffect(() => {
    if (
      !selectedVisitId ||
      previousSelectedVisitId.current === selectedVisitId
    ) {
      return;
    }

    previousSelectedVisitId.current = selectedVisitId;
    const visit = visits.find((candidate) => candidate.id === selectedVisitId);
    if (!visit) return;

    map.flyTo([visit.lat, visit.lng], 14, { animate: true, duration: 0.5 });
    markerRefs.current[selectedVisitId]?.openPopup?.();
  }, [map, markerRefs, selectedVisitId, visits]);

  return null;
}

function RecenterControl({ visits }) {
  const map = useMap();

  return (
    <div className="absolute right-3 top-3 z-[1000]">
      <button
        type="button"
        onClick={() => fitRoute(map, visits)}
        className="min-h-11 rounded-[var(--task-radius-control)] border border-[var(--task-primary)] bg-white px-3 py-2 text-sm font-semibold text-[var(--task-primary)] shadow-md hover:bg-[var(--task-surface-soft)]"
      >
        Recenter
      </button>
    </div>
  );
}

export default function OperatorSitterRouteMapInner({
  visits = [],
  selectedVisitId = null,
  onSelectVisit,
}) {
  const markerRefs = useRef({});
  const mappedVisits = useMemo(
    () => visits.filter((visit) => visit.hasCoordinates),
    [visits]
  );
  const center = [mappedVisits[0].lat, mappedVisits[0].lng];
  const routePositions = mappedVisits.map((visit) => [visit.lat, visit.lng]);

  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-[var(--task-radius-card)] border border-[var(--task-border)] shadow-sm sm:h-[440px]">
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

        <FitRoute visits={mappedVisits} />
        <FocusSelectedStop
          visits={mappedVisits}
          selectedVisitId={selectedVisitId}
          markerRefs={markerRefs}
        />
        <RecenterControl visits={mappedVisits} />

        {routePositions.length > 1 ? (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: "#275a49", weight: 4, opacity: 0.72 }}
          />
        ) : null}

        {mappedVisits.map((visit) => (
          <Marker
            key={visit.id}
            position={[visit.lat, visit.lng]}
            icon={makeNumberedIcon(
              visit.stopNumber,
              visit.id === selectedVisitId
            )}
            ref={(instance) => {
              if (instance) markerRefs.current[visit.id] = instance;
            }}
            eventHandlers={{
              click: () => onSelectVisit?.(visit.id),
            }}
          >
            <Popup>
              <div className="min-w-48 text-sm text-[var(--task-text)]">
                <p className="font-bold">
                  Stop {visit.stopNumber} · {visit.petDisplayName}
                </p>
                {visit.showServiceContext ? (
                  <p className="mt-1">{visit.serviceSummary}</p>
                ) : null}
                <p className="mt-1 text-[var(--task-text-muted)]">
                  {formatTime(visit.startTime)}–{formatTime(visit.endTime)} · {STATUS_LABELS[visit.operationalStatus] || "Scheduled"}
                </p>
                <p className="mt-1 text-[var(--task-text-muted)]">
                  Owner: {visit.ownerName}
                </p>
                {visit.address ? (
                  <p className="mt-1 break-words text-[var(--task-text-muted)]">
                    {visit.address}
                  </p>
                ) : null}
                <a
                  href={`/dashboard/operator/bookings/${visit.bookingId}`}
                  className="mt-2 inline-flex font-semibold text-[var(--task-primary)] underline underline-offset-2"
                >
                  View booking
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
