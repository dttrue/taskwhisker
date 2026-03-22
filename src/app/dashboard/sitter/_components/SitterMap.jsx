// src/app/dashboard/sitter/_components/SitterMap.jsx
"use client";

import dynamic from "next/dynamic";

const SitterMapInner = dynamic(() => import("./SitterMapInner"), {
  ssr: false,
});

export default function SitterMap({ bookings = [] }) {
  return <SitterMapInner bookings={bookings} />;
}
