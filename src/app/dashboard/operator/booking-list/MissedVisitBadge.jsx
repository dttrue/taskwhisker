// src/app/dashboard/operator/booking-list/MissedVisitBadge.jsx


function MissedVisitBadge({ count }) {
  if (!count) return null;

  return (
    <div className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      {count} missed visit{count === 1 ? "" : "s"}
    </div>
  );
}

export default MissedVisitBadge;
