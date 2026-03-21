// src/app/book/ steps/BookingStepService.jsx
"use client";

import ServicePicker from "../ServicePicker";

export default function BookingStepService({
  serviceOptions,
  serviceCode,
  setServiceCode,
  setServiceType,
  setScheduleMode,
}) {
  function handleServiceChange(svc) {
    if (!svc) return;

    setServiceCode(svc.code);
    setServiceType(svc.serviceType);

    if (svc.serviceType === "OVERNIGHT") {
      setScheduleMode("SAME");
    }
  }

  return (
    <div className="space-y-3">
      <ServicePicker
        options={serviceOptions}
        value={serviceCode}
        onChange={handleServiceChange}
      />

      <p className="text-xs text-zinc-500">
        Next: pick dates and a time window.
      </p>
    </div>
  );
}
