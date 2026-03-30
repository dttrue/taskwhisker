// src/app/dashboard/sitter/lib/mapIcons.js
import L from "leaflet";

export function makeNumberedIcon(
  number,
  isSelected = false,
  isInGrace = false
) {
  const background = isInGrace ? "#f59e0b" : isSelected ? "#2563eb" : "#111827";

  const pulse = isInGrace
    ? `
      <div style="
        position: absolute;
        inset: -6px;
        border-radius: 9999px;
        background: rgba(245, 158, 11, 0.28);
        animation: sitterPulse 1.6s ease-out infinite;
      "></div>
    `
    : "";

  return L.divIcon({
    className: "",
    html: `
      <div style="position: relative; width: 24px; height: 24px;">
        ${pulse}
        <div style="
          position: relative;
          width: 24px;
          height: 24px;
          border-radius: 9999px;
          background: ${background};
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
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}
