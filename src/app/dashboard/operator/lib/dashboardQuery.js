// src/app/dashboard/operator/lib/dashboardQuery.js

const ALLOWED = new Set([
  "ALL",
  "REQUESTED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELED",
]);

function parseDateOnly(v) {
  // expects "YYYY-MM-DD"
  if (!v) return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  // use local date (safe for <input type="date" />)
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function safeSearchParams(searchParams) {
  return searchParams && typeof searchParams === "object" ? searchParams : {};
}

export function resolveStatus(searchParams) {
  const sp = safeSearchParams(searchParams);

  const raw =
    typeof sp.status === "string"
      ? sp.status
      : Array.isArray(sp.status)
      ? sp.status[0]
      : "ALL";

  const val = (raw || "ALL").toString().trim().toUpperCase();
  return ALLOWED.has(val) ? val : "ALL";
}

/**
 * ✅ Default: next 7 days
 * - If user provides from/to, we honor it
 * - If neither provided, we show today..today+7
 */
export function resolveDateRange(searchParams) {
  const sp = safeSearchParams(searchParams);

  const from = parseDateOnly(sp.from);
  const to = parseDateOnly(sp.to);

  if (!from && !to) {
    const today = new Date();
    return {
      from: startOfDay(today),
      to: endOfDay(addDays(today, 7)),
      isDefault: true,
    };
  }

  return {
    from: from ? startOfDay(from) : null,
    to: to ? endOfDay(to) : null,
    isDefault: false,
  };
}

/**
 * date-only where clause (useful for metrics too)
 */
export function buildDateWhere({ from, to }) {
  // if no date range selected, show everything
  if (!from && !to) return {};

  const startTime = {};
  if (from) startTime.gte = from;
  if (to) startTime.lte = to;

  return { startTime };
}


/**
 * ✅ One place to build list filtering:
 * - date range always applies
 * - status applies unless ALL
 */
export function buildBookingsWhere({ status, from, to }) {
  const dateWhere = buildDateWhere({ from, to });

  if (!status || status === "ALL") return dateWhere;

  return {
    ...dateWhere,
    status,
  };
}
