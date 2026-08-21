"use client";

import dynamic from "next/dynamic";

const OperatorSitterRouteMapInner = dynamic(
  () => import("./OperatorSitterRouteMapInner"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] w-full animate-pulse rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] sm:h-[440px]" />
    ),
  }
);

export default function OperatorSitterRouteMap(props) {
  return <OperatorSitterRouteMapInner {...props} />;
}
