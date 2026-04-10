// src/app/dashboard/sitter/lib/mapIcons.js
import L from "leaflet";

export function makeNumberedIcon(index, isSelected = false, isInGrace = false) {
  const size = isSelected ? 42 : 34;

  let stateStyles = "";

  if (isSelected) {
    stateStyles = `
      background: #2563eb;
      color: white;
      border: 2px solid #ffffff;
      box-shadow:
        0 0 0 4px rgba(191, 219, 254, 0.95),
        0 10px 20px rgba(37, 99, 235, 0.28);
      transform: scale(1.08);
    `;
  } else if (isInGrace) {
    stateStyles = `
      background: #16a34a;
      color: white;
      border: 2px solid #ffffff;
      box-shadow:
        0 0 0 3px rgba(187, 247, 208, 0.9),
        0 8px 18px rgba(22, 163, 74, 0.22);
    `;
  } else {
    stateStyles = `
      background: #ffffff;
      color: #18181b;
      border: 1px solid #d4d4d8;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.14);
    `;
  }

  const html = `
    <div
      style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 9999px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        transition: all 0.2s ease;
        ${stateStyles}
      "
    >
      ${index}
    </div>
  `;

  return L.divIcon({
    html,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}