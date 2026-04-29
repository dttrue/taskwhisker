// src/utils/formatTime.js

export function formatTime12h(dateOrString) {
  const d = new Date(dateOrString);

  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
