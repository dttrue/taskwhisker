'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function CoverageInboxRefresh({ fingerprint }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false, inFlight = false;
    async function poll() {
      if (stopped || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try { const response = await fetch('/api/coverage-messages/poll?scope=inbox', { cache: 'no-store' }); if (!stopped && response.ok && (await response.json()).fingerprint !== fingerprint) router.refresh(); }
      catch { /* Retry on next visible interval. */ } finally { inFlight = false; }
    }
    const timer = setInterval(poll, 20000);
    window.addEventListener('focus', poll); document.addEventListener('visibilitychange', poll);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll); };
  }, [fingerprint, router]);
  return null;
}
