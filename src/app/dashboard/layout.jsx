// src/app/dashboard/layout.jsx
import { requireAuth } from "@/auth";

export default async function DashboardLayout({ children }) {
  await requireAuth();
  return <>{children}</>;
}
