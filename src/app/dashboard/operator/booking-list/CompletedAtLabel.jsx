// src/app/dashboard/operator/booking-list/CompletedAtLabel.jsx

function CompletedAtLabel({ value }) {
  const label = formatCompletedAt(value);
  if (!label) return null;

  return <div className="mt-1 text-xs text-blue-700">Completed {label}</div>;
}

export default CompletedAtLabel;