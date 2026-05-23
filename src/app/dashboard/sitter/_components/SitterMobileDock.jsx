// src/app/dashboard/sitter/_components/SitterMobileDock.jsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function HomeIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
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
      className="h-4 w-4 shrink-0"
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
      className="h-4 w-4 shrink-0"
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

const navItems = [
  {
    label: "Home",
    href: "/dashboard/sitter",
    icon: <HomeIcon />,
  },
  {
    label: "Inbox",
    href: "/dashboard/sitter/messages",
    icon: <InboxIcon />,
  },
  {
    label: "Settings",
    href: "/dashboard/sitter/settings",
    icon: <SettingsIcon />,
  },
];

export default function SitterMobileDock() {
  const pathname = usePathname();

  

  return (
  <nav
    style={{
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 999999,
      height: 58,
      background: "white",
      borderTop: "1px solid #e4e4e7",
      boxShadow: "0 -3px 10px rgba(0,0,0,0.08)",
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        height: "100%",
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard/sitter" &&
            pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              fontSize: 11,
              fontWeight: 700,
              background: isActive ? "#18181b" : "white",
              color: isActive ? "white" : "#71717a",
              textDecoration: "none",
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  </nav>
);
}
