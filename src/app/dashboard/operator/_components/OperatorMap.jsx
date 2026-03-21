// src/app/dashboard/operator/_components/OperatorMap.jsx
"use client";

import dynamic from "next/dynamic";

const OperatorMapInner = dynamic(() => import("./OperatorMapInner"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-4 text-sm font-medium text-zinc-900">
        Service Locations
      </div>
      <div className="h-[400px] w-full rounded-b-xl bg-zinc-100" />
    </div>
  ),
});

export default function OperatorMap({ bookings = [] }) {
  return <OperatorMapInner bookings={bookings} />;
}