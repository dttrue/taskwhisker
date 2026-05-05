// src/app/dashboard/operator/booking-list/StatusBadge.jsx

import { STATUS_LABELS, STATUS_PILL_CLASSES } from "@/lib/statusStyles";

function StatusBadge({ status }) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border";

  const pillClasses =
    STATUS_PILL_CLASSES[status] || "bg-zinc-100 text-zinc-700 border-zinc-200";

  return (
    <span className={`${base} ${pillClasses}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default StatusBadge;
