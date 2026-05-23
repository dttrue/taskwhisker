// src/app/dashboard/sitter/components/messaging/MessageAutoRefresh.jsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MessageAutoRefresh({ intervalMs = 10000 }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [router, intervalMs]);

  return null;
}
