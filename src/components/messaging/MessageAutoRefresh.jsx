// src/app/dashboard/sitter/components/messaging/MessageAutoRefresh.jsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

const DEVELOPMENT_INTERVAL_MS = 60000;
const PRODUCTION_THREAD_INTERVAL_MS = 15000;
const PRODUCTION_INBOX_INTERVAL_MS = 20000;

export default function MessageAutoRefresh({
  scope,
  initialFingerprint,
  bookingId = null,
  clientLinkToken = null,
}) {
  const router = useRouter();
  const fingerprintRef = useRef(initialFingerprint);
  const inFlightRef = useRef(false);

  const intervalMs =
    process.env.NODE_ENV === "development"
      ? DEVELOPMENT_INTERVAL_MS
      : scope === "sitter-inbox"
      ? PRODUCTION_INBOX_INTERVAL_MS
      : PRODUCTION_THREAD_INTERVAL_MS;

  const pollUrl = useMemo(() => {
    const params = new URLSearchParams({ scope });
    if (bookingId) params.set("bookingId", bookingId);
    if (clientLinkToken) params.set("clientLinkToken", clientLinkToken);
    return `/api/messages/poll?${params.toString()}`;
  }, [bookingId, clientLinkToken, scope]);

  useEffect(() => {
    fingerprintRef.current = initialFingerprint;
  }, [initialFingerprint]);

  useEffect(() => {
    let timerId = null;
    let isMounted = true;

    function clearTimer() {
      if (timerId) clearTimeout(timerId);
      timerId = null;
    }

    function schedule() {
      clearTimer();
      if (!isMounted || document.visibilityState !== "visible") return;
      timerId = setTimeout(poll, intervalMs);
    }

    async function poll() {
      clearTimer();

      if (
        !isMounted ||
        document.visibilityState !== "visible" ||
        inFlightRef.current
      ) {
        schedule();
        return;
      }

      inFlightRef.current = true;

      try {
        const result = await fetch(pollUrl, { cache: "no-store" });
        if (!result.ok) return;

        const data = await result.json();
        if (
          !isMounted ||
          !data ||
          typeof data.fingerprint !== "string"
        ) {
          return;
        }

        if (data.fingerprint !== fingerprintRef.current) {
          fingerprintRef.current = data.fingerprint;
          router.refresh();
        }
      } catch {
        // Background polling retries on the next scheduled attempt.
      } finally {
        inFlightRef.current = false;
        schedule();
      }
    }

    function refreshWhenActive() {
      if (document.visibilityState !== "visible") {
        clearTimer();
        return;
      }

      clearTimer();
      void poll();
    }

    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("focus", refreshWhenActive);
    schedule();

    return () => {
      isMounted = false;
      clearTimer();
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("focus", refreshWhenActive);
    };
  }, [intervalMs, pollUrl, router]);

  return null;
}
