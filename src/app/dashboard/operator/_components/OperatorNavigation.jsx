"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard/operator", section: "dashboard" },
  {
    label: "Operations",
    href: "/dashboard/operator/operations",
    section: "operations",
  },
  { label: "Triage", href: "/dashboard/operator/triage", section: "triage" },
  {
    label: "Blocked Clients",
    href: "/dashboard/operator/blocked-clients",
    section: "blocked-clients",
  },
];

function getActiveSection(pathname) {
  if (pathname.startsWith("/dashboard/operator/operations")) {
    return "operations";
  }
  if (pathname.startsWith("/dashboard/operator/triage")) {
    return "triage";
  }
  if (pathname.startsWith("/dashboard/operator/blocked-clients")) {
    return "blocked-clients";
  }
  return "dashboard";
}

function NavigationLinks({ activeSection, onNavigate }) {
  return (
    <nav aria-label="Operator navigation" className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive = activeSection === item.section;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            onClick={onNavigate}
            className={`flex min-h-11 items-center rounded-[var(--task-radius-control)] border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isActive
                ? "border-[#9fbdae] bg-[var(--task-primary)] text-white shadow-sm"
                : "border-transparent text-[var(--task-text-muted)] hover:bg-[var(--task-surface-soft)] hover:text-[var(--task-text)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ compact = false }) {
  return (
    <div className={compact ? "leading-tight" : "border-b border-[var(--task-border)] pb-5"}>
      <p className="text-base font-bold tracking-[-0.025em] text-[var(--task-text)]">
        TaskWhisker
      </p>
      <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--task-primary)]">
        Operator
      </p>
    </div>
  );
}

function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
    >
      Sign out
    </button>
  );
}

export default function OperatorNavigation({ accountLabel }) {
  const pathname = usePathname();
  const activeSection = getActiveSection(pathname);
  const [isOpen, setIsOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const closeMenu = () => {
    setIsOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusableElements = Array.from(
        drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements.at(-1);

      if (!firstFocusable || !lastFocusable) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      } else if (!drawerRef.current.contains(document.activeElement)) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-[var(--task-border)] bg-white px-4 py-6 lg:flex">
        <Brand />
        <div className="mt-6 flex-1">
          <NavigationLinks activeSection={activeSection} />
        </div>
        <div className="border-t border-[var(--task-border)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--task-text-muted)]">
            Signed in
          </p>
          <p className="mt-1 break-all text-sm font-medium text-[var(--task-text)]">
            {accountLabel || "Operator"}
          </p>
          <SignOutButton />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-4 border-b border-[var(--task-border)] bg-white/95 px-4 backdrop-blur sm:px-6 lg:hidden">
        <Brand compact />
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open operator navigation"
          aria-expanded={isOpen}
          aria-controls="operator-mobile-navigation"
          onClick={() => setIsOpen(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] bg-white px-4 text-sm font-semibold text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
        >
          Menu
        </button>
      </header>

      {isOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close operator navigation"
            className="absolute inset-0 bg-[#17211d]/45"
            onClick={closeMenu}
          />
          <aside
            ref={drawerRef}
            id="operator-mobile-navigation"
            aria-label="Operator menu"
            role="dialog"
            aria-modal="true"
            className="relative flex h-full w-[min(84vw,320px)] flex-col border-r border-[var(--task-border)] bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--task-border)] pb-5">
              <Brand compact />
              <button
                type="button"
                autoFocus
                aria-label="Close operator navigation"
                onClick={closeMenu}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--task-radius-control)] border border-[var(--task-border-strong)] text-xl leading-none text-[var(--task-text)] hover:bg-[var(--task-surface-soft)]"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="mt-5 flex-1">
              <NavigationLinks
                activeSection={activeSection}
                onNavigate={() => setIsOpen(false)}
              />
            </div>
            <div className="border-t border-[var(--task-border)] pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--task-text-muted)]">
                Signed in
              </p>
              <p className="mt-1 break-all text-sm font-medium text-[var(--task-text)]">
                {accountLabel || "Operator"}
              </p>
              <SignOutButton />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
