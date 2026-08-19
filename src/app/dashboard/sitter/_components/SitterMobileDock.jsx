// src/app/dashboard/sitter/_components/SitterMobileDock.jsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function HomeIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M3 11 12 3l9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </g>
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </g>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.3.49 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </g>
    </svg>
  );
}

export default function SitterMobileDock() {
  const inFlightRef = useRef(false);
  const pathname = usePathname();

  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let timerId = null;
    const intervalMs =
      process.env.NODE_ENV === "development" ? 120000 : 30000;

    function clearTimer() {
      if (timerId) clearTimeout(timerId);
      timerId = null;
    }

    function schedule() {
      clearTimer();
      if (!isMounted || document.visibilityState !== "visible") return;
      timerId = setTimeout(loadUnreadCount, intervalMs);
    }

    async function loadUnreadCount() {
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
        const res = await fetch("/api/sitter/unread-messages", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = await res.json();

        if (isMounted) {
          setUnreadMessagesCount(Number(data.count || 0));
        }
      } catch {
        // Keep dock quiet if unread count fails.
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
      void loadUnreadCount();
    }

    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("focus", refreshWhenActive);
    void loadUnreadCount();

    return () => {
      isMounted = false;
      clearTimer();
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("focus", refreshWhenActive);
    };
  }, [pathname]);

  const navItems = [
    {
      label: "Home",
      href: "/dashboard/sitter",
      icon: <HomeIcon />,
      badgeCount: 0,
    },
    {
      label: "Inbox",
      href: "/dashboard/sitter/messages",
      icon: <InboxIcon />,
      badgeCount: unreadMessagesCount,
    },
    {
      label: "Settings",
      href: "/dashboard/sitter/settings",
      icon: <SettingsIcon />,
      badgeCount: 0,
    },
  ];

  return (
    <nav
      aria-label="Sitter navigation"
      className="fixed inset-x-0 bottom-0 z-[999999] border-t border-[var(--task-border)] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(34,37,34,0.5)] backdrop-blur"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-3 px-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard/sitter" &&
              pathname.startsWith(`${item.href}/`));

          const showBadge = Number(item.badgeCount) > 0;
          const badgeLabel =
            Number(item.badgeCount) > 99 ? "99+" : String(item.badgeCount);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative m-1 flex min-h-11 flex-col items-center justify-center gap-1 rounded-[var(--task-radius-control)] text-xs font-bold transition-colors ${
                isActive
                  ? "bg-[var(--task-primary)] text-white"
                  : "text-[var(--task-text-muted)] hover:bg-[var(--task-surface-soft)] hover:text-[var(--task-text)]"
              }`}
            >
              <span className="relative inline-flex items-center justify-center">
                {item.icon}

                {showBadge && (
                  <span
                    aria-label={`${item.badgeCount} unread messages`}
                    className={`absolute -right-4 -top-2.5 z-20 min-w-[1.25rem] rounded-full bg-[var(--task-danger)] px-1.5 text-center text-xs font-black leading-5 text-white ring-2 ${
                      isActive ? "ring-[var(--task-primary)]" : "ring-white"
                    }`}
                  >
                    {badgeLabel}
                  </span>
                )}
              </span>

              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
